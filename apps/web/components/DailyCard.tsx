'use client';

import { useEffect, useState, type ComponentType } from 'react';
import {
  LOGIN_REWARDS,
  dailyChallenges,
  dailyState,
  loginBonusAvailable,
  nextLoginStreak,
  utcDay,
  weekOf,
  weeklyQuests,
  weeklyState,
} from '@ludo/engine';
import { CoinAmount, CoinIcon } from './Coins';
import { Icon } from './Icons';
import { Sheet } from './Sheet';
import { tr, useLang } from '@/lib/i18n';
import { claimDailyBonus, useProfile } from '@/lib/profile';
import { sfx } from '@/lib/sound';

type IconComponent = ComponentType<{ size?: number; className?: string }>;

export const CHALLENGE_ICON: Record<string, IconComponent> = {
  play3: Icon.Dice,
  win2: Icon.Trophy,
  capture5: Icon.Target,
  home8: Icon.Home,
  hard1: Icon.Robot,
  online1: Icon.Groups,
  flawless1: Icon.Shield,
};

export const QUEST_ICON: Record<string, IconComponent> = {
  w_play15: Icon.Dice,
  w_win7: Icon.Trophy,
  w_online3: Icon.Groups,
  w_dames5: Icon.Crown,
  w_dameswin2: Icon.Medal,
  w_ludo10: Icon.Dice,
  w_capture30: Icon.Target,
  w_home20: Icon.Home,
};

export function untilMidnightUtc(): string {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const minutes = Math.ceil((next - now.getTime()) / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
}

function untilNextWeek(): string {
  const now = new Date();
  const daysLeft = 7 - ((now.getUTCDay() + 6) % 7);
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysLeft);
  const hours = Math.ceil((next - now.getTime()) / 3_600_000);
  return hours >= 24 ? tr(`${Math.floor(hours / 24)} j ${hours % 24} h`, `${Math.floor(hours / 24)} d ${hours % 24} h`) : `${hours} h`;
}

/** Where the player is in the 7-day login cycle, and how to claim today's bonus. */
function useLoginBonus() {
  const { profile, ready } = useProfile();
  const [day, setDay] = useState('');
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDay(utcDay()), []);

  const available = !!day && loginBonusAvailable(profile, day);
  const streak = available ? nextLoginStreak(profile, day) : profile.login.streak;
  const cycleDay = ((Math.max(1, streak) - 1) % LOGIN_REWARDS.length) + 1;

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const { coins } = await claimDailyBonus();
      sfx.finish();
      setClaimed(coins);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Impossible pour le moment.', 'Not possible right now.'));
    } finally {
      setBusy(false);
    }
  };

  return { ready: ready && !!day, day, profile, available, streak, cycleDay, busy, claimed, error, claim };
}

function StreakCalendar({ cycleDay, available }: { cycleDay: number; available: boolean }) {
  const { t } = useLang();
  return (
    <ol className="grid grid-cols-7 gap-1.5">
      {LOGIN_REWARDS.map((coins, i) => {
        const n = i + 1;
        const done = n < cycleDay || (!available && n === cycleDay);
        const today = n === cycleDay && available;
        const last = n === LOGIN_REWARDS.length;
        return (
          <li
            key={n}
            className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-[11px] transition ${
              today
                ? 'bg-[#00a884] text-[#0b141a] shadow-lg shadow-[#00a884]/20'
                : done
                  ? 'bg-[#00a884]/15 text-[#00a884]'
                  : 'bg-[#0b141a]/60 text-[#8696a0]'
            }`}
          >
            <span className="font-semibold">{t(`J${n}`, `D${n}`)}</span>
            <span className="grid size-6 place-items-center">
              {done ? <Icon.Check size={20} /> : last ? <Icon.Gift size={20} className={today ? '' : 'text-[#ffbc38]'} /> : <CoinIcon size={18} />}
            </span>
            <span className="font-bold tabular-nums">{coins}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Daily login bonus, the day's challenges and the week's quests. */
export function DailyCard() {
  const bonus = useLoginBonus();
  const { t } = useLang();
  if (!bonus.ready) return <section className="h-64 animate-pulse rounded-[28px] bg-[#1f2c33]" />;
  const { profile, day, available, streak, cycleDay } = bonus;
  const daily = dailyState(profile, day);
  const week = weekOf(day);
  const weekly = weeklyState(profile, week);
  const series = available ? streak - 1 : streak;

  return (
    <section className="flex flex-col gap-5 rounded-[28px] bg-[#1f2c33] p-4">
      <div>
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#ffbc38]/15 text-[#ffbc38]">
            <Icon.Gift size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium text-[#e9edef]">{t('Bonus du jour', 'Daily bonus')}</span>
            <span className="block text-[13px] text-[#8696a0]">{t('Connecte-toi chaque jour, le 7e jour rapporte le plus', 'Sign in every day, day 7 pays the most')}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#ff7a45]/15 px-2.5 py-1 text-[12.5px] font-semibold text-[#ff9a6b]">
            <Icon.Flame size={15} />
            {t(`${series} j`, `${series} d`)}
          </span>
        </div>
        <StreakCalendar cycleDay={cycleDay} available={available} />
        {available ? (
          <button
            type="button"
            onClick={bonus.claim}
            disabled={bonus.busy}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] transition active:scale-[0.98] disabled:opacity-60"
          >
            {t('Récupérer', 'Claim')} <CoinAmount value={LOGIN_REWARDS[cycleDay - 1]} size={18} />
          </button>
        ) : (
          <p className="mt-3 text-center text-[13px] text-[#8696a0]">
            {bonus.claimed ? (
              <span className="font-semibold text-[#25d366]">{t(`+${bonus.claimed} pièces récupérées`, `+${bonus.claimed} coins claimed`)}</span>
            ) : (
              t('Reviens demain pour continuer ta série.', 'Come back tomorrow to keep your streak.')
            )}
          </p>
        )}
        {bonus.error && <p className="mt-2 text-center text-[13px] text-[#f15c6d]">{bonus.error}</p>}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13px] font-medium text-[#00a884]">{t('Défis du jour', 'Daily challenges')}</h2>
          <span className="flex items-center gap-1 text-[12px] text-[#8696a0]">
            <Icon.Timer size={14} />
            {t('Nouveaux dans', 'New in')} {untilMidnightUtc()}
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {dailyChallenges(day).map((c) => (
            <ChallengeRow
              key={c.id}
              icon={CHALLENGE_ICON[c.id] ?? Icon.Target}
              label={c.label}
              goal={c.goal}
              progress={daily.progress[c.id] ?? 0}
              done={daily.done.includes(c.id)}
              coins={c.coins}
            />
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13px] font-medium text-[#00a884]">{t('Défis de la semaine', 'Weekly challenges')}</h2>
          <span className="flex items-center gap-1 text-[12px] text-[#8696a0]">
            <Icon.Calendar size={14} />
            {t('Nouveaux dans', 'New in')} {untilNextWeek()}
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {weeklyQuests(week).map((q) => (
            <ChallengeRow
              key={q.id}
              icon={QUEST_ICON[q.id] ?? Icon.Target}
              label={q.label}
              goal={q.goal}
              progress={weekly.progress[q.id] ?? 0}
              done={weekly.done.includes(q.id)}
              coins={q.coins}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ChallengeRow({
  icon: RowIcon,
  label,
  goal,
  progress,
  done,
  coins,
}: {
  icon: IconComponent;
  label: string;
  goal: number;
  progress: number;
  done: boolean;
  coins: number;
}) {
  const value = Math.min(goal, progress);
  return (
    <li className={`flex items-center gap-3 rounded-2xl p-3 ${done ? 'bg-[#00a884]/10' : 'bg-[#0b141a]/50'}`}>
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full ${done ? 'bg-[#00a884] text-[#0b141a]' : 'bg-[#2a3942] text-[#aebac1]'}`}
      >
        {done ? <Icon.Check size={20} /> : <RowIcon size={19} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[14.5px] ${done ? 'text-[#8696a0] line-through' : 'text-[#e9edef]'}`}>{label}</span>
          <CoinAmount value={coins} size={13} className="shrink-0 text-[12.5px] text-[#ffd279]" />
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <span
              className={`block h-full rounded-full transition-[width] ${done ? 'bg-[#00a884]' : 'bg-[#ffbc38]'}`}
              style={{ width: `${(value / goal) * 100}%` }}
            />
          </span>
          <span className="shrink-0 text-[11.5px] text-[#8696a0] tabular-nums">
            {value}/{goal}
          </span>
        </span>
      </span>
    </li>
  );
}

const DISMISSED_KEY = 'luchat:daily-dismissed';

/** Opens once a day on the home screen while today's login bonus is waiting. */
export function DailyBonusPrompt() {
  const bonus = useLoginBonus();
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!bonus.ready || !bonus.available) return;
    if (localStorage.getItem(DISMISSED_KEY) === bonus.day) return;
    const timer = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(timer);
  }, [bonus.ready, bonus.available, bonus.day]);

  const close = () => {
    localStorage.setItem(DISMISSED_KEY, bonus.day);
    setOpen(false);
  };

  const coins = LOGIN_REWARDS[bonus.cycleDay - 1];
  return (
    <Sheet open={open} title={t('Bonus du jour', 'Daily bonus')} onClose={close}>
      <div className="flex flex-col items-center gap-4 pb-1 text-center">
        <span className="pop-in grid size-20 place-items-center rounded-full bg-gradient-to-br from-[#ffbc38] to-[#ff7a45] text-[#0b141a] shadow-xl shadow-[#ffbc38]/20">
          {bonus.claimed ? <Icon.Check size={44} /> : <Icon.Gift size={42} />}
        </span>
        {bonus.claimed ? (
          <>
            <div>
              <p className="text-[20px] font-semibold">{t(`+${bonus.claimed} pièces`, `+${bonus.claimed} coins`)}</p>
              <p className="mt-1 text-[14px] text-[#8696a0]">
                {t(
                  `Série de ${bonus.profile.login.streak} jour${bonus.profile.login.streak > 1 ? 's' : ''}. À demain !`,
                  `${bonus.profile.login.streak}-day streak. See you tomorrow!`,
                )}
              </p>
            </div>
            <button type="button" onClick={close} className="h-12 w-full rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a]">
              {t('Super', 'Great')}
            </button>
          </>
        ) : (
          <>
            <div>
              <p className="text-[20px] font-semibold">{t(`Jour ${bonus.cycleDay} de ta série`, `Day ${bonus.cycleDay} of your streak`)}</p>
              <p className="mt-1 text-[14px] text-[#8696a0]">
                {t(
                  `Reviens chaque jour : le 7e jour rapporte ${LOGIN_REWARDS[LOGIN_REWARDS.length - 1]} pièces.`,
                  `Come back every day: day 7 pays ${LOGIN_REWARDS[LOGIN_REWARDS.length - 1]} coins.`,
                )}
              </p>
            </div>
            <div className="w-full">
              <StreakCalendar cycleDay={bonus.cycleDay} available={bonus.available} />
            </div>
            <button
              type="button"
              onClick={bonus.claim}
              disabled={bonus.busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] transition active:scale-[0.98] disabled:opacity-60"
            >
              {t('Récupérer', 'Claim')} <CoinAmount value={coins} size={18} />
            </button>
            {bonus.error && <p className="text-[13px] text-[#f15c6d]">{bonus.error}</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}
