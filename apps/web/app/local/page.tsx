'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  DEFAULT_RULES,
  DUEL_PAIRS,
  areDiagonal,
  botReaction,
  eventKey,
  sanitizeRules,
  stakeTable,
  type BotLevel,
  type Color,
  type Rules,
} from '@ludo/engine';
import { AppearancePicker } from '@/components/AppearancePicker';
import { GameView } from '@/components/GameView';
import { Avatar } from '@/components/PlayerPanel';
import { Icon } from '@/components/Icons';
import { BOT_LEVEL_HINT, IconButton, ListRow, PRESET_ICON, RowIcon, RulesEditor, SectionTitle } from '@/components/MobileList';
import { Sheet } from '@/components/Sheet';
import { COLOR_DARK, COLOR_HEX } from '@/lib/board';
import { useAppearance } from '@/lib/appearance';
import { BOT_LEVEL_LABEL, COLOR_LABEL, matchPreset, rulesSummary } from '@/lib/labels';
import { useReactionBubbles } from '@/lib/reactions';
import { activeSeats, useLocalGame, type LocalSeat, type LocalSetup } from '@/lib/useLocalGame';
import { BackButton } from '@/components/BackButton';
import { StakePicker } from '@/components/StakePicker';
import { getSessionToken, useProfile } from '@/lib/profile';
import { getSocket, storeRoomToken } from '@/lib/socket';
import { tr, useLang } from '@/lib/i18n';

/** Verified account of each seat, for a staked game. */
type Accounts = Partial<Record<Color, string>>;

const STORAGE_KEY = 'ludo:localSetup';

/** Seats are shown in the same layout as the board corners. */
const CORNER_ORDER: Color[] = ['red', 'green', 'blue', 'yellow'];

const DEFAULT_SETUP: LocalSetup = {
  seats: [
    { color: 'red', kind: 'human', name: 'Joueur 1', botLevel: 'medium' },
    { color: 'green', kind: 'none', name: 'Joueur 2', botLevel: 'medium' },
    { color: 'yellow', kind: 'bot', name: 'Joueur 3', botLevel: 'medium' },
    { color: 'blue', kind: 'none', name: 'Joueur 4', botLevel: 'medium' },
  ],
  rules: DEFAULT_RULES,
};

/** Default seat names are saved in French ("Joueur 2"): shown in the current language. */
export function seatName(name: string): string {
  return name.replace(/^Joueur (\d)$/, tr('Joueur $1', 'Player $1'));
}

function setupError(setup: LocalSetup, wager: string | null, accounts: Accounts, me: string | null): string | null {
  const active = activeSeats(setup);
  if (active.length < 2) return tr('Ajoute au moins 2 joueurs.', 'Add at least 2 players.');
  if (wager) {
    if (!me) return tr('Connecte-toi pour jouer avec mise.', 'Sign in to play with a stake.');
    if (active.some((s) => s.kind === 'bot')) return tr('Pas d’ordinateur dans une partie avec mise : retire-les.', 'No computer players in a staked game: remove them.');
    const missing = active.filter((s) => !accounts[s.color]);
    if (missing.length) {
      const colors = missing.map((s) => COLOR_LABEL[s.color].toLowerCase()).join(', ');
      return tr(`Vérifie le compte de chaque joueur (${colors}).`, `Verify each player’s account (${colors}).`);
    }
    if (!active.some((s) => accounts[s.color] === me)) return tr('Tu dois faire partie des joueurs (« C’est moi »).', 'You must be one of the players (“It’s me”).');
  }
  if (setup.rules.teams && active.length !== 4) return tr('Le mode équipes nécessite 4 joueurs.', 'Team mode needs 4 players.');
  if (active.length === 2 && !areDiagonal(active[0].color, active[1].color)) {
    return tr('À deux, les camps doivent être en diagonale : choisis un duel ci-dessus.', 'With two players, sides must be diagonal: pick a duel above.');
  }
  return null;
}

/**
 * Moves the two active players onto a diagonal pair, keeping a player in place when possible.
 * Returns the new setup and, for each colour of the pair, the colour its player came from.
 */
function applyDuelPair(setup: LocalSetup, pair: [Color, Color]): { setup: LocalSetup; from: Map<Color, Color> } {
  const active = activeSeats(setup);
  const assigned = new Map<Color, LocalSeat>();
  for (const s of active) if (pair.includes(s.color)) assigned.set(s.color, s);
  const rest = active.filter((s) => !pair.includes(s.color));
  for (const c of pair) if (!assigned.has(c) && rest.length) assigned.set(c, rest.shift()!);
  return {
    setup: {
      ...setup,
      seats: setup.seats.map((seat) => {
        const src = assigned.get(seat.color);
        return src ? { ...seat, kind: src.kind, name: src.name, botLevel: src.botLevel } : { ...seat, kind: 'none' };
      }),
    },
    from: new Map([...assigned].map(([to, src]) => [to, src.color])),
  };
}

export default function LocalPage() {
  const [setup, setSetup] = useState<LocalSetup>(DEFAULT_SETUP);
  const [gameKey, setGameKey] = useState<number | null>(null);
  const [editColor, setEditColor] = useState<Color | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [wager, setWager] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Accounts>({});
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const { board, dice, pawn } = useAppearance();
  const { session } = useProfile();
  const me = session?.username ?? null;
  const router = useRouter();
  const { t } = useLang();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved?.seats?.length === 4) setSetup({ seats: saved.seats, rules: sanitizeRules(saved.rules) });
    } catch {
      // Ignore corrupted saved setup.
    }
  }, []);

  const updateSeat = (color: Color, patch: Partial<LocalSeat>) => {
    setSetup((s) => ({ ...s, seats: s.seats.map((seat) => (seat.color === color ? { ...seat, ...patch } : seat)) }));
    if (patch.kind && patch.kind !== 'human') setAccounts((a) => ({ ...a, [color]: undefined }));
  };

  const setAccount = (color: Color, username: string | undefined) => {
    setAccounts((a) => ({ ...a, [color]: username }));
    if (username) updateSeat(color, { name: username });
  };

  const pickDuel = (pair: [Color, Color]) => {
    const { setup: next, from } = applyDuelPair(setup, pair);
    setSetup(next);
    setAccounts((a) => Object.fromEntries([...from].map(([to, src]) => [to, a[src]])) as Accounts);
  };

  const startStaked = () => {
    const seats = activeSeats(setup).map((s) => ({ color: s.color, username: accounts[s.color]! }));
    setLaunching(true);
    setLaunchError(null);
    getSocket()
      .timeout(10_000)
      .emit('local:create', { auth: getSessionToken(), wager: wager!, rules: setup.rules, seats }, (err, res) => {
        setLaunching(false);
        if (err) return setLaunchError(t('Impossible de joindre le serveur de jeu.', 'Could not reach the game server.'));
        if (!res.ok) return setLaunchError(res.error);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
        storeRoomToken(res.code, res.token);
        router.push(`/online/${res.code}`);
      });
  };

  const start = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    setSetup({
      ...setup,
      seats: setup.seats.map((s) => ({
        ...s,
        name:
          s.kind === 'bot'
            ? t(`Ordi ${BOT_LEVEL_LABEL[s.botLevel].toLowerCase()}`, `${BOT_LEVEL_LABEL[s.botLevel]} computer`)
            : seatName(s.name.trim()) || COLOR_LABEL[s.color],
      })),
    });
    setGameKey(Date.now());
  };

  if (gameKey !== null) {
    return <LocalGame key={gameKey} setup={setup} onQuit={() => setGameKey(null)} />;
  }

  const error = setupError(setup, wager, accounts, me);
  const table = stakeTable(wager);
  const count = activeSeats(setup).length;
  const editing = editColor ? setup.seats.find((s) => s.color === editColor)! : null;
  const preset = matchPreset(setup.rules);
  const PresetIcon = (preset && PRESET_ICON[preset.id]) || Icon.Tune;
  const summary = rulesSummary(setup.rules);
  const setRules = (rules: Rules) => setSetup((s) => ({ ...s, rules }));

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <header className="sticky top-0 z-10 bg-[#1f2c33] pt-[env(safe-area-inset-top)] shadow-md">
        <div className="mx-auto flex h-16 max-w-lg items-center gap-1 px-1">
          <BackButton href="/ludo" label={t('Retour à Ludo', 'Back to Ludo')} text="Ludo" />
          <div className="min-w-0 flex-1 px-1">
            <h1 className="truncate text-[20px] leading-tight font-medium">{t('Nouvelle partie', 'New game')}</h1>
            <p className="truncate text-[13px] text-[#8696a0]">
              {t(`Sur cet écran · ${count} joueur${count > 1 ? 's' : ''}`, `On this screen · ${count} player${count > 1 ? 's' : ''}`)}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg pb-40">
        <section className="mx-4 mt-4 flex items-center gap-4 rounded-[28px] bg-[#1f2c33] p-4">
          <BoardPreview seats={setup.seats} />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-medium">{t('Un seul téléphone', 'One phone')}</p>
            <p className="mt-0.5 text-[13.5px] leading-snug text-[#8696a0]">
              {wager
                ? t(
                    'Chaque joueur confirme son compte avec un code reçu dans son app LuChat, puis vous vous passez l’appareil.',
                    'Each player confirms their account with a code sent to their LuChat app, then you pass the device around.',
                  )
                : t(
                    'Passez-vous l’appareil à chaque tour. Complète avec des ordinateurs si vous êtes moins de 4.',
                    'Pass the device around each turn. Add computer players if there are fewer than 4 of you.',
                  )}
            </p>
          </div>
        </section>

        <SectionTitle>{t('Type de partie', 'Game type')}</SectionTitle>
        <div className="mx-4 rounded-[24px] bg-[#1f2c33] p-3">
          <StakePicker value={wager} onChange={setWager} players={Math.max(2, count)} freeOnly />
        </div>

        <SectionTitle>{t('Joueurs', 'Players')}</SectionTitle>
        <ul className="divide-y divide-[#222d34]">
          {CORNER_ORDER.map((color) => {
            const seat = setup.seats.find((s) => s.color === color)!;
            return (
              <li key={color}>
                <SeatRow
                  seat={seat}
                  staked={!!wager}
                  account={accounts[color]}
                  me={me}
                  onEdit={() => setEditColor(color)}
                  onAdd={(kind) => updateSeat(color, { kind })}
                />
              </li>
            );
          })}
        </ul>

        {count === 2 && <DuelPicker setup={setup} onPick={pickDuel} />}

        <SectionTitle>{t('Paramètres de la partie', 'Game settings')}</SectionTitle>
        <ListRow
          leading={
            <RowIcon color="#00a884">
              <PresetIcon size={22} />
            </RowIcon>
          }
          title={t(`Règles : ${preset?.label ?? 'personnalisées'}`, `Rules: ${preset?.label ?? 'custom'}`)}
          subtitle={summary.length ? summary.join(' · ') : t('Règles standard', 'Standard rules')}
          trailing={<Icon.ChevronRight className="text-[#8696a0]" />}
          onClick={() => setRulesOpen(true)}
        />
        <ListRow
          leading={
            <RowIcon color="#53bdeb">
              <Icon.Palette size={22} />
            </RowIcon>
          }
          title={t('Apparence', 'Appearance')}
          subtitle={t(
            `${board.name} · dés ${dice.name.toLowerCase()} · pions ${pawn.name.toLowerCase()}`,
            `${board.name} · ${dice.name.toLowerCase()} dice · ${pawn.name.toLowerCase()} pawns`,
          )}
          trailing={<Icon.ChevronRight className="text-[#8696a0]" />}
          onClick={() => setLookOpen(true)}
        />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#222d34] bg-[#0b141a] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          {(error || launchError) && (
            <p className={`mb-2 flex items-center justify-center gap-1.5 text-center text-[13px] ${launchError ? 'text-[#f15c6d]' : 'text-[#ffbc38]'}`}>
              <Icon.Info size={16} className="shrink-0" />
              {launchError ?? error}
            </p>
          )}
          <button
            type="button"
            disabled={!!error || launching}
            onClick={wager ? startStaked : start}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#00a884] text-[16px] font-semibold text-[#0b141a] shadow-lg shadow-black/30 transition active:scale-[0.98] disabled:bg-[#2a3942] disabled:text-[#8696a0] disabled:shadow-none"
          >
            <Icon.Play />
            {table
              ? t(`Miser ${table.stake} ${table.currency === 'premium' ? 'Premium' : 'pièces'} et lancer`, `Stake ${table.stake} ${table.currency === 'premium' ? 'Premium' : 'coins'} and start`)
              : t('Lancer la partie', 'Start the game')}
          </button>
          {table && !error && (
            <p className="mt-2 text-center text-[12px] text-[#8696a0]">{t('Les mises de tous les joueurs sont prélevées au lancement.', 'Every player’s stake is taken when the game starts.')}</p>
          )}
        </div>
      </div>

      <Sheet open={editing !== null} title={editing ? t(`Joueur ${COLOR_LABEL[editing.color].toLowerCase()}`, `${COLOR_LABEL[editing.color]} player`) : ''} onClose={() => setEditColor(null)}>
        {editing && (
          <SeatEditor
            seat={editing}
            staked={!!wager}
            me={me}
            account={accounts[editing.color]}
            taken={Object.entries(accounts)
              .filter(([c, name]) => c !== editing.color && name)
              .map(([, name]) => name!)}
            onAccount={(username) => setAccount(editing.color, username)}
            onChange={(patch) => updateSeat(editing.color, patch)}
            onDone={() => setEditColor(null)}
          />
        )}
      </Sheet>

      <Sheet open={rulesOpen} title={t('Règles et variantes', 'Rules and variants')} onClose={() => setRulesOpen(false)}>
        <RulesEditor rules={setup.rules} onChange={setRules} />
      </Sheet>

      <Sheet open={lookOpen} title={t('Apparence', 'Appearance')} onClose={() => setLookOpen(false)}>
        <AppearancePicker />
      </Sheet>
    </div>
  );
}

/** The four corners of the board, lit for the seats in play. */
function BoardPreview({ seats }: { seats: LocalSeat[] }) {
  return (
    <span className="grid size-[92px] shrink-0 place-items-center">
    <span className="grid size-[64px] rotate-45 grid-cols-2 gap-1 rounded-[18px] bg-black/30 p-1">
      {CORNER_ORDER.map((c) => {
        const seat = seats.find((s) => s.color === c)!;
        const on = seat.kind !== 'none';
        return (
          <span
            key={c}
            className="grid place-items-center rounded-[10px] text-white transition"
            style={{ background: on ? `linear-gradient(145deg, ${COLOR_HEX[c]}, ${COLOR_DARK[c]})` : 'rgba(255,255,255,0.06)' }}
          >
            {on && <span className="-rotate-45">{seat.kind === 'bot' ? <Icon.Robot size={16} /> : <Icon.Person size={16} />}</span>}
          </span>
        );
      })}
    </span>
    </span>
  );
}

function SeatAvatar({ seat }: { seat: LocalSeat }) {
  const hex = COLOR_HEX[seat.color];
  if (seat.kind === 'none') {
    return (
      <span className="grid size-11 place-items-center rounded-full border-2 border-dashed" style={{ borderColor: `${hex}99`, color: hex }}>
        <Icon.PersonAdd size={20} />
      </span>
    );
  }
  return (
    <span className="grid size-11 place-items-center rounded-full text-[17px] font-semibold text-white" style={{ background: hex }}>
      {seat.kind === 'bot' ? <Icon.Robot size={22} /> : (seatName(seat.name.trim())[0] ?? COLOR_LABEL[seat.color][0]).toUpperCase()}
    </span>
  );
}

function SeatRow({
  seat,
  staked,
  account,
  me,
  onEdit,
  onAdd,
}: {
  seat: LocalSeat;
  staked: boolean;
  account?: string;
  me: string | null;
  onEdit: () => void;
  onAdd: (kind: 'human' | 'bot') => void;
}) {
  const { t } = useLang();
  const colorTag = (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: COLOR_HEX[seat.color] }} />
      {COLOR_LABEL[seat.color]}
    </span>
  );

  if (seat.kind === 'none') {
    return (
      <ListRow
        leading={<SeatAvatar seat={seat} />}
        title={<span className="text-[#8696a0]">{t('Place libre', 'Free seat')}</span>}
        subtitle={colorTag}
        trailing={
          <span className="flex items-center gap-1">
            {!staked && (
              <IconButton label={t('Ajouter un ordinateur', 'Add a computer player')} onClick={() => onAdd('bot')}>
                <Icon.Robot size={22} />
              </IconButton>
            )}
            <button
              type="button"
              onClick={() => onAdd('human')}
              className="h-9 rounded-full bg-[#00a884]/15 px-4 text-[14px] font-medium text-[#00a884] transition active:bg-[#00a884]/25"
            >
              {t('Ajouter', 'Add')}
            </button>
          </span>
        }
      />
    );
  }

  const stakeStatus = !staked ? null : seat.kind === 'bot' ? (
    <span className="text-[#f15c6d]">{t('Pas d’ordinateur avec mise', 'No computer with a stake')}</span>
  ) : account ? (
    <span className="inline-flex items-center gap-0.5 text-[#25d366]">
      <Icon.Check size={14} />
      {account === me ? t('Toi', 'You') : t('Compte vérifié', 'Verified account')}
    </span>
  ) : (
    <span className="text-[#ffbc38]">{t('Compte à vérifier', 'Account to verify')}</span>
  );

  return (
    <ListRow
      leading={<SeatAvatar seat={seat} />}
      title={
        seat.kind === 'bot'
          ? t(`Ordinateur ${BOT_LEVEL_LABEL[seat.botLevel].toLowerCase()}`, `${BOT_LEVEL_LABEL[seat.botLevel]} computer`)
          : staked
            ? (account ?? t('Toucher pour vérifier', 'Tap to verify'))
            : seatName(seat.name.trim()) || COLOR_LABEL[seat.color]
      }
      subtitle={
        <span className="inline-flex items-center gap-1.5">
          {colorTag}
          <span>·</span>
          {stakeStatus ?? (seat.kind === 'bot' ? t('Ordinateur', 'Computer') : t('Joueur', 'Player'))}
        </span>
      }
      trailing={<Icon.ChevronRight className="text-[#8696a0]" />}
      onClick={onEdit}
    />
  );
}

const KIND_OPTIONS = [
  { kind: 'human', label: ['Joueur', 'Player'], icon: Icon.Person },
  { kind: 'bot', label: ['Ordinateur', 'Computer'], icon: Icon.Robot },
  { kind: 'none', label: ['Personne', 'Nobody'], icon: Icon.Block },
] as const;

function SeatEditor({
  seat,
  staked,
  me,
  account,
  taken,
  onAccount,
  onChange,
  onDone,
}: {
  seat: LocalSeat;
  staked: boolean;
  me: string | null;
  account?: string;
  taken: string[];
  onAccount: (username: string | undefined) => void;
  onChange: (patch: Partial<LocalSeat>) => void;
  onDone: () => void;
}) {
  const { t } = useLang();
  const kinds = staked ? KIND_OPTIONS.filter((k) => k.kind !== 'bot') : KIND_OPTIONS;
  return (
    <div className="flex flex-col gap-5">
      <div className={`grid gap-1 rounded-full bg-[#0b141a] p-1 ${staked ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {kinds.map(({ kind, label, icon: KindIcon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onChange({ kind })}
            aria-pressed={seat.kind === kind}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-full text-[13.5px] font-medium transition ${
              seat.kind === kind ? 'bg-[#00a884] text-[#0b141a]' : 'text-[#aebac1] active:bg-white/5'
            }`}
          >
            <KindIcon size={18} />
            {t<string>(label[0], label[1])}
          </button>
        ))}
      </div>

      {seat.kind === 'human' && staked && (
        <AccountVerifier me={me} account={account} taken={taken} onAccount={onAccount} onDone={onDone} />
      )}

      {seat.kind === 'human' && !staked && (
        <label className="block">
          <span className="mb-1.5 block px-1 text-[13px] font-medium text-[#00a884]">{t('Nom du joueur', 'Player name')}</span>
          <input
            value={seatName(seat.name)}
            maxLength={20}
            autoFocus
            onChange={(e) => onChange({ name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && onDone()}
            placeholder={COLOR_LABEL[seat.color]}
            enterKeyHint="done"
            className="h-12 w-full rounded-2xl border-b-2 border-[#00a884] bg-[#2a3942] px-4 text-[16px] text-[#e9edef] outline-none placeholder:text-[#8696a0]"
          />
        </label>
      )}

      {seat.kind === 'bot' && (
        <ul className="-mx-5">
          {(['easy', 'medium', 'hard'] as BotLevel[]).map((level) => {
            const selected = seat.botLevel === level;
            return (
              <li key={level}>
                <ListRow
                  leading={
                    <span className={`grid size-11 place-items-center rounded-full ${selected ? 'bg-[#00a884] text-[#0b141a]' : 'bg-white/10'}`}>
                      <Icon.Robot size={22} />
                    </span>
                  }
                  title={BOT_LEVEL_LABEL[level]}
                  subtitle={BOT_LEVEL_HINT[level]}
                  trailing={
                    <span
                      className={`grid size-5 place-items-center rounded-full border-2 ${selected ? 'border-[#00a884]' : 'border-[#8696a0]'}`}
                    >
                      {selected && <span className="size-2.5 rounded-full bg-[#00a884]" />}
                    </span>
                  }
                  onClick={() => onChange({ botLevel: level })}
                />
              </li>
            );
          })}
        </ul>
      )}

      {seat.kind === 'none' && <p className="text-center text-[14px] text-[#8696a0]">{t('Ce camp restera vide pendant la partie.', 'This side will stay empty during the game.')}</p>}

      <button
        type="button"
        onClick={onDone}
        className="flex h-12 w-full items-center justify-center rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] active:opacity-90"
      >
        {t('Terminé', 'Done')}
      </button>
    </div>
  );
}

function DuelPicker({ setup, onPick }: { setup: LocalSetup; onPick: (pair: [Color, Color]) => void }) {
  const active = activeSeats(setup).map((s) => s.color);
  const valid = areDiagonal(active[0], active[1]);
  const { t } = useLang();

  return (
    <>
      <SectionTitle>Duel</SectionTitle>
      <p className={`px-5 pb-2 text-[13.5px] ${valid ? 'text-[#8696a0]' : 'text-[#ffbc38]'}`}>
        {t('À deux, les camps se font face en diagonale.', 'With two players, sides face each other diagonally.')}
      </p>
      <ul>
        {DUEL_PAIRS.map((pair) => {
          const selected = pair.every((c) => active.includes(c));
          return (
            <li key={pair.join('-')}>
              <ListRow
                leading={<MiniBoard pair={pair} />}
                title={t(`${COLOR_LABEL[pair[0]]} contre ${COLOR_LABEL[pair[1]]}`, `${COLOR_LABEL[pair[0]]} vs ${COLOR_LABEL[pair[1]]}`)}
                trailing={
                  <span className={`grid size-5 place-items-center rounded-full border-2 ${selected ? 'border-[#00a884]' : 'border-[#8696a0]'}`}>
                    {selected && <span className="size-2.5 rounded-full bg-[#00a884]" />}
                  </span>
                }
                onClick={() => onPick(pair)}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** 2x2 grid of board corners with the duel pair highlighted. */
function MiniBoard({ pair }: { pair: [Color, Color] }) {
  return (
    <span className="grid size-10 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-lg">
      {CORNER_ORDER.map((c) => (
        <span key={c} style={{ background: COLOR_HEX[c], opacity: pair.includes(c) ? 1 : 0.15 }} />
      ))}
    </span>
  );
}

const BOT_REACTION_DELAY_MS = 700;

function LocalGame({ setup, onQuit }: { setup: LocalSetup; onQuit: () => void }) {
  const { state, roll, move, abandon, restart, isBotTurn } = useLocalGame(setup);
  const [quitOpen, setQuitOpen] = useState(false);
  const { t } = useLang();
  const seats = activeSeats(setup).map((s) => ({
    color: s.color,
    name: s.name,
    isBot: s.kind === 'bot',
    botLevel: s.botLevel,
    connected: true,
  }));
  const humansInGame = activeSeats(setup).filter((s) => s.kind === 'human' && !state.forfeited.includes(s.color));
  const humanColors = activeSeats(setup).filter((s) => s.kind === 'human').map((s) => s.color);
  const botColors = activeSeats(setup).filter((s) => s.kind === 'bot').map((s) => s.color);
  const reactions = useReactionBubbles(humanColors);
  const { show } = reactions;

  const key = eventKey(state);
  const botsKey = botColors.join();
  useEffect(() => {
    const message = botReaction(state, botsKey ? (botsKey.split(',') as Color[]) : []);
    if (!message) return;
    const timer = setTimeout(() => show(message), BOT_REACTION_DELAY_MS);
    return () => clearTimeout(timer);
    // Keyed on the event rather than the whole state, so bots react once per event.
  }, [key, botsKey, show]);

  // On a shared screen, reactions come from the player whose turn it is, or the first human.
  const current = state.players[state.current].color;
  const reactor = humanColors.includes(current) ? current : humansInGame[0]?.color;
  const onReact = reactor ? (reaction: string) => show({ color: reactor, reaction }) : undefined;

  const requestQuit = () => {
    if (state.phase === 'over' || humansInGame.length === 0) return onQuit();
    if (humansInGame.length === 1) {
      if (confirm(t('Quitter la partie ? Tu abandonnes et tu perds.', 'Leave the game? You forfeit and lose.'))) onQuit();
      return;
    }
    setQuitOpen(true);
  };

  return (
    <>
    <GameView
      state={state}
      seats={seats}
      canAct={!isBotTurn && state.phase !== 'over'}
      onRoll={roll}
      onMove={move}
      title="LUDO"
      onQuit={requestQuit}
      rewardColors={humanColors}
      online={false}
      reactions={{ ...reactions, onReact }}
      overlayActions={
        <>
          <button type="button" onClick={restart} className="btn btn-primary">
            {t('Rejouer', 'Play again')}
          </button>
          <button type="button" onClick={onQuit} className="btn btn-ghost">
            {t('Changer les joueurs', 'Change players')}
          </button>
        </>
      }
    />
    <Sheet open={quitOpen} title={t('Qui quitte la partie ?', 'Who is leaving the game?')} onClose={() => setQuitOpen(false)}>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-white/70">
          {t('Le joueur qui quitte perd. Le dernier encore en jeu remporte la partie.', 'The player who leaves loses. The last one still in the game wins.')}
        </p>
        {humansInGame.map((s) => (
          <button
            key={s.color}
            type="button"
            className="btn btn-ghost justify-start"
            onClick={() => {
              abandon(s.color);
              setQuitOpen(false);
            }}
          >
            <Avatar color={s.color} seat={{ ...s, isBot: false, connected: true }} size={32} />
            {t(`${s.name} abandonne`, `${s.name} forfeits`)}
          </button>
        ))}
        <button type="button" className="btn mt-2 bg-red-500/20 text-red-200" onClick={onQuit}>
          {t('Arrêter la partie (sans vainqueur)', 'Stop the game (no winner)')}
        </button>
      </div>
    </Sheet>
    </>
  );
}

/**
 * Proves a player is next to this device: they get a code in their own LuChat app and type it here.
 * The signed-in owner of the device just picks "C'est moi".
 */
function AccountVerifier({
  me,
  account,
  taken,
  onAccount,
  onDone,
}: {
  me: string | null;
  account?: string;
  taken: string[];
  onAccount: (username: string | undefined) => void;
  onDone: () => void;
}) {
  const [username, setUsername] = useState('');
  const [sentTo, setSentTo] = useState<{ username: string; online: boolean } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLang();

  if (account) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-[#25d366]/10 p-3">
        <span className="grid size-10 place-items-center rounded-full bg-[#25d366] text-[#0b141a]">
          <Icon.Check size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{account}</span>
          <span className="block text-[13px] text-[#8696a0]">{account === me ? t('C’est toi', 'It’s you') : t('Compte vérifié par code', 'Account verified by code')}</span>
        </span>
        <button type="button" onClick={() => onAccount(undefined)} className="h-9 rounded-full px-3 text-[14px] font-medium text-[#00a884] active:bg-white/5">
          {t('Changer', 'Change')}
        </button>
      </div>
    );
  }

  const request = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    if (taken.some((n) => n.toLowerCase() === clean.toLowerCase())) return setError(t('Ce joueur a déjà une place.', 'This player already has a seat.'));
    setBusy(true);
    setError(null);
    getSocket()
      .timeout(10_000)
      .emit('local:requestCode', { username: clean, auth: getSessionToken() }, (err, res) => {
        setBusy(false);
        if (err) return setError(t('Impossible de joindre le serveur de jeu.', 'Could not reach the game server.'));
        if (!res.ok) return setError(res.error);
        setSentTo({ username: res.username, online: res.online });
        setCode('');
      });
  };

  const verify = () => {
    if (!sentTo || code.length !== 6) return;
    setBusy(true);
    setError(null);
    getSocket()
      .timeout(10_000)
      .emit('local:verifyCode', { username: sentTo.username, code }, (err, res) => {
        setBusy(false);
        if (err) return setError(t('Impossible de joindre le serveur de jeu.', 'Could not reach the game server.'));
        if (!res.ok) return setError(res.error);
        onAccount(res.username);
        onDone();
      });
  };

  return (
    <div className="flex flex-col gap-3">
      {me && !taken.includes(me) && !sentTo && (
        <button
          type="button"
          onClick={() => {
            onAccount(me);
            onDone();
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] active:opacity-90"
        >
          <Icon.Person size={20} />
          {t(`C’est moi (${me})`, `It’s me (${me})`)}
        </button>
      )}

      {!sentTo ? (
        <>
          <p className="text-[13.5px] leading-snug text-[#8696a0]">
            {t(
              'Sinon, entre le pseudo du joueur : il recevra un code à 6 chiffres dans son app LuChat, sur son propre téléphone.',
              'Otherwise, enter the player’s username: they will get a 6-digit code in their LuChat app, on their own phone.',
            )}
          </p>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && request(username)}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              maxLength={16}
              placeholder={t('Pseudo LuChat du joueur', 'Player’s LuChat username')}
              enterKeyHint="send"
              className="h-12 min-w-0 flex-1 rounded-2xl border-b-2 border-[#00a884] bg-[#2a3942] px-4 text-[16px] text-[#e9edef] outline-none placeholder:text-[#8696a0]"
            />
            <button
              type="button"
              disabled={busy || !username.trim()}
              onClick={() => request(username)}
              className="h-12 shrink-0 rounded-full bg-[#00a884]/15 px-4 text-[14px] font-semibold text-[#00a884] disabled:opacity-40"
            >
              {busy ? t('Envoi…', 'Sending…') : t('Envoyer le code', 'Send the code')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13.5px] leading-snug text-[#d1d7db]">
            {t('Code envoyé à', 'Code sent to')} <span className="font-semibold">{sentTo.username}</span>.{' '}
            {sentTo.online
              ? t('Il s’affiche dans son app LuChat.', 'It shows in their LuChat app.')
              : t(
                  'Son app n’est pas ouverte : il a reçu une notification. Sinon, demande-lui d’ouvrir LuChat puis renvoie le code.',
                  'Their app isn’t open: they got a notification. Otherwise, ask them to open LuChat, then resend the code.',
                )}
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && verify()}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="______"
            aria-label={t('Code à 6 chiffres', '6-digit code')}
            className="h-14 w-full rounded-2xl border-b-2 border-[#00a884] bg-[#2a3942] text-center font-mono text-[28px] tracking-[0.5em] text-[#e9edef] outline-none placeholder:text-[#8696a0]/50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => request(sentTo.username)}
              disabled={busy}
              className="h-12 flex-1 rounded-full border border-[#2a3942] text-[14px] font-medium text-[#e9edef] active:bg-white/5 disabled:opacity-40"
            >
              {t('Renvoyer', 'Resend')}
            </button>
            <button
              type="button"
              onClick={verify}
              disabled={busy || code.length !== 6}
              className="h-12 flex-1 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] disabled:opacity-40"
            >
              {busy ? t('Vérification…', 'Checking…') : t('Valider', 'Confirm')}
            </button>
          </div>
          <button type="button" onClick={() => setSentTo(null)} className="text-[13px] text-[#8696a0]">
            {t('Changer de joueur', 'Change player')}
          </button>
        </>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-[13px] text-[#f15c6d]">
          <Icon.Info size={16} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
