import { randomUUID } from 'node:crypto';
import { DEFAULT_RULES, type Currency, type MatchStatus, type Rules, type StakeTable } from '@ludo/engine';
import { originOf, sameOrigin } from './identity';
import type { RoomManager } from './rooms';

/** Quick matches are short: two pawns each, leaving the base with a 1 or a 6. */
export const QUICK_MATCH_RULES: Rules = { ...DEFAULT_RULES, pawnsPerPlayer: 2, exitOn: 'oneOrSix' };

const MAX_PLAYERS = 4;
/** Once two players are waiting, others have this long to join the same game. */
const GATHER_MS = 8_000;
/** At the practice table, a lone player gets a computer opponent after this delay. */
const ALONE_MS = 25_000;
const PRACTICE = '';

interface Waiting {
  socketId: string;
  name: string;
  userId?: number;
  since: number;
}

export interface MatchCallbacks {
  status: (socketId: string, status: MatchStatus) => void;
  found: (socketId: string, match: { code: string; token: string }) => void;
  cancelled: (socketId: string, reason: string) => void;
  /** Takes the stakes for a new game; returns the accounts that couldn't pay (nothing is taken then). */
  openPot: (potId: string, table: StakeTable, userIds: number[]) => number[];
}

/** Players waiting at one table (the practice table, or one stake level). */
class TableQueue {
  queue: Waiting[] = [];
  private gatherTimer: NodeJS.Timeout | null = null;
  private gatherAt: number | null = null;
  private aloneTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly table: StakeTable | null,
    private rooms: RoomManager,
    private callbacks: MatchCallbacks,
  ) {}

  has(socketId: string, userId?: number) {
    return this.queue.some((w) => w.socketId === socketId || (userId !== undefined && w.userId === userId));
  }

  join(player: Omit<Waiting, 'since'>) {
    this.queue.push({ ...player, since: Date.now() });
    this.update();
  }

  leave(socketId: string, userId?: number) {
    const before = this.queue.length;
    this.queue = this.queue.filter((w) => w.socketId !== socketId && (userId === undefined || w.userId !== userId));
    if (this.queue.length !== before) this.update();
  }

  /** Players who can play together, in arrival order: at staked tables, never two from one device or address. */
  private group(): Waiting[] {
    const group: Waiting[] = [];
    for (const w of this.queue) {
      if (group.length >= MAX_PLAYERS) break;
      if (this.table && group.some((g) => sameOrigin(originOf(g.socketId), originOf(w.socketId)))) continue;
      group.push(w);
    }
    return group;
  }

  private takeGroup(): Waiting[] {
    const group = this.group();
    this.queue = this.queue.filter((w) => !group.includes(w));
    return group;
  }

  private update() {
    if (this.group().length >= MAX_PLAYERS) {
      this.launch(this.takeGroup());
    }
    if (this.group().length >= 2) {
      this.clearAlone();
      if (!this.gatherTimer) {
        this.gatherAt = Date.now() + GATHER_MS;
        this.gatherTimer = setTimeout(() => {
          this.gatherTimer = null;
          this.gatherAt = null;
          if (this.group().length >= 2) this.launch(this.takeGroup());
          this.update();
        }, GATHER_MS);
      }
    } else {
      this.clearGather();
      // Nobody stakes for a computer: at staked tables a lone player waits for real opponents.
      if (!this.table && this.queue.length === 1 && !this.aloneTimer) {
        const alone = this.queue[0];
        this.aloneTimer = setTimeout(() => {
          this.aloneTimer = null;
          if (this.queue.length === 1 && this.queue[0] === alone) this.launch(this.queue.splice(0, 1), true);
          this.update();
        }, Math.max(0, alone.since + ALONE_MS - Date.now()));
      }
      if (this.queue.length === 0) this.clearAlone();
    }
    this.broadcast();
  }

  private launch(players: Waiting[], withBot = false) {
    let stake: { potId: string; table: StakeTable } | undefined;
    if (this.table) {
      const potId = randomUUID();
      let short: number[];
      try {
        short = this.callbacks.openPot(potId, this.table, players.map((p) => p.userId!));
      } catch (err) {
        console.error('Impossible de prendre les mises', err);
        for (const p of players) this.callbacks.cancelled(p.socketId, 'La partie n’a pas pu démarrer, aucune pièce n’a été prise.');
        return;
      }
      if (short.length) {
        for (const p of players.filter((p) => short.includes(p.userId!))) {
          this.callbacks.cancelled(p.socketId, 'Solde insuffisant pour cette mise.');
        }
        // The others keep their place at the front of the queue.
        this.queue.unshift(...players.filter((p) => !short.includes(p.userId!)));
        return;
      }
      stake = { potId, table: this.table };
    }
    const { room, tokens } = this.rooms.createMatch(players, withBot ? ['medium'] : [], QUICK_MATCH_RULES, stake);
    players.forEach((p, i) => this.callbacks.found(p.socketId, { code: room.code, token: tokens[i] }));
  }

  private broadcast() {
    const alone = !this.table && this.queue.length === 1 ? this.queue[0] : null;
    const status: MatchStatus = {
      waiting: this.queue.length,
      startsAt: this.gatherAt,
      botAt: alone ? alone.since + ALONE_MS : null,
      table: this.table?.id ?? null,
    };
    for (const w of this.queue) this.callbacks.status(w.socketId, status);
  }

  private clearGather() {
    if (this.gatherTimer) clearTimeout(this.gatherTimer);
    this.gatherTimer = null;
    this.gatherAt = null;
  }

  private clearAlone() {
    if (this.aloneTimer) clearTimeout(this.aloneTimer);
    this.aloneTimer = null;
  }
}

/** Public queues pairing strangers into rooms of 2 to 4 players, one per table. */
export class Matchmaker {
  private tables = new Map<string, TableQueue>();

  constructor(
    private rooms: RoomManager,
    private callbacks: MatchCallbacks,
  ) {}

  /** A player waits at one table at a time; staked tables need a signed-in player. */
  join(player: Omit<Waiting, 'since'>, table: StakeTable | null = null) {
    if (table && !player.userId) throw new Error('Connecte-toi pour jouer avec une mise.');
    // One search per connection, and per account at staked tables.
    this.leave(player.socketId, player.userId);
    const key = table?.id ?? PRACTICE;
    let queue = this.tables.get(key);
    if (!queue) {
      queue = new TableQueue(table, this.rooms, this.callbacks);
      this.tables.set(key, queue);
    }
    queue.join(player);
  }

  /** Players searching, all tables together. */
  waiting(): number {
    let n = 0;
    for (const queue of this.tables.values()) n += queue.queue.length;
    return n;
  }

  /** Stops every search (or only those at tables of `currency`), telling the players why. */
  cancelAll(reason: string, currency?: Currency) {
    for (const queue of this.tables.values()) {
      if (currency && queue.table?.currency !== currency) continue;
      for (const w of [...queue.queue]) {
        this.callbacks.cancelled(w.socketId, reason);
        queue.leave(w.socketId);
      }
    }
  }

  leave(socketId: string, userId?: number) {
    for (const queue of this.tables.values()) {
      if (!queue.has(socketId, userId)) continue;
      // Another device of the same account stops searching.
      for (const w of queue.queue) {
        if (w.socketId !== socketId && userId !== undefined && w.userId === userId) {
          this.callbacks.cancelled(w.socketId, 'Recherche lancée sur un autre appareil.');
        }
      }
      queue.leave(socketId, userId);
    }
    // Players can type any amount: empty queues are dropped so they don't pile up.
    for (const [key, queue] of this.tables) if (queue.queue.length === 0) this.tables.delete(key);
  }
}
