import { DEFAULT_RULES, type MatchStatus, type Rules } from '@ludo/engine';
import type { RoomManager } from './rooms';

/** Quick matches are short: two pawns each, leaving the base with a 1 or a 6. */
export const QUICK_MATCH_RULES: Rules = { ...DEFAULT_RULES, pawnsPerPlayer: 2, exitOn: 'oneOrSix' };

const MAX_PLAYERS = 4;
/** Once two players are waiting, others have this long to join the same game. */
const GATHER_MS = 8_000;
/** A lone player gets a computer opponent after this delay. */
const ALONE_MS = 25_000;

interface Waiting {
  socketId: string;
  name: string;
  userId?: number;
  since: number;
}

export interface MatchCallbacks {
  status: (socketId: string, status: MatchStatus) => void;
  found: (socketId: string, match: { code: string; token: string }) => void;
}

/** Public queue pairing strangers into rooms of 2 to 4 players. */
export class Matchmaker {
  private queue: Waiting[] = [];
  private gatherTimer: NodeJS.Timeout | null = null;
  private gatherAt: number | null = null;
  private aloneTimer: NodeJS.Timeout | null = null;

  constructor(
    private rooms: RoomManager,
    private callbacks: MatchCallbacks,
  ) {}

  join(player: Omit<Waiting, 'since'>) {
    this.queue = this.queue.filter((w) => w.socketId !== player.socketId);
    this.queue.push({ ...player, since: Date.now() });
    this.update();
  }

  leave(socketId: string) {
    const before = this.queue.length;
    this.queue = this.queue.filter((w) => w.socketId !== socketId);
    if (this.queue.length !== before) this.update();
  }

  private update() {
    if (this.queue.length >= MAX_PLAYERS) {
      this.launch(this.queue.splice(0, MAX_PLAYERS));
    }
    if (this.queue.length >= 2) {
      this.clearAlone();
      if (!this.gatherTimer) {
        this.gatherAt = Date.now() + GATHER_MS;
        this.gatherTimer = setTimeout(() => {
          this.gatherTimer = null;
          this.gatherAt = null;
          if (this.queue.length >= 2) this.launch(this.queue.splice(0, MAX_PLAYERS));
          this.update();
        }, GATHER_MS);
      }
    } else {
      this.clearGather();
      if (this.queue.length === 1 && !this.aloneTimer) {
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
    const { room, tokens } = this.rooms.createMatch(players, withBot ? ['medium'] : [], QUICK_MATCH_RULES);
    players.forEach((p, i) => this.callbacks.found(p.socketId, { code: room.code, token: tokens[i] }));
  }

  private broadcast() {
    const alone = this.queue.length === 1 ? this.queue[0] : null;
    const status: MatchStatus = {
      waiting: this.queue.length,
      startsAt: this.gatherAt,
      botAt: alone ? alone.since + ALONE_MS : null,
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
