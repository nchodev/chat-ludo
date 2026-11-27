'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import type { AppNotification, NotificationKind } from '@ludo/engine';
import { AppBar } from '@/components/AppBar';
import { GemIcon } from '@/components/Coins';
import { Icon } from '@/components/Icons';
import { useLang } from '@/lib/i18n';
import { loadNotifications, markAllSeen, useNotifications } from '@/lib/notifications';
import { useProfile } from '@/lib/profile';

const PAGE = 40;

const KIND_STYLE: Record<NotificationKind, { icon: ComponentType<{ size?: number; className?: string }>; tone: string }> = {
  wallet: { icon: ({ size }) => <GemIcon size={size} />, tone: 'bg-violet-600/20 text-violet-200' },
  game: { icon: Icon.Trophy, tone: 'bg-amber-500/15 text-amber-300' },
  referral: { icon: Icon.Gift, tone: 'bg-[#00a884]/15 text-[#00a884]' },
  friend: { icon: Icon.PersonAdd, tone: 'bg-sky-500/15 text-sky-300' },
  announcement: { icon: Icon.Bell, tone: 'bg-[#f15c6d]/15 text-[#f15c6d]' },
};

export default function NotificationsPage() {
  const { session, ready } = useProfile();
  const { latest } = useNotifications();
  const { t, locale } = useLang();
  const [items, setItems] = useState<AppNotification[]>([]);
  // Notifications newer than this were not seen before opening the page: they stay highlighted.
  const [seenUpTo, setSeenUpTo] = useState(Number.MAX_SAFE_INTEGER);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownLatest = useRef<number | null>(null);

  const load = useCallback(async (before?: number) => {
    setLoading(true);
    setError(null);
    try {
      const view = await loadNotifications(before);
      setItems((prev) => (before ? [...prev, ...view.items] : view.items));
      if (!before) setSeenUpTo(view.seenUpTo);
      setMore(view.items.length === PAGE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notifications indisponibles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      setLoading(false);
      return;
    }
    void load().then(() => markAllSeen());
  }, [ready, session, load]);

  // A notification arriving while the list is open shows at the top, already seen.
  useEffect(() => {
    if (!latest || shownLatest.current === latest.id) return;
    shownLatest.current = latest.id;
    setItems((prev) => (prev.some((n) => n.id === latest.id) ? prev : [latest, ...prev]));
    void markAllSeen();
  }, [latest]);

  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const longDay = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const dayLabel = (ms: number) => {
    const day = new Date(ms).toDateString();
    if (day === new Date().toDateString()) return t('Aujourd’hui', 'Today');
    if (day === new Date(Date.now() - 86_400_000).toDateString()) return t('Hier', 'Yesterday');
    return longDay.format(ms);
  };
  const groups: { day: string; items: AppNotification[] }[] = [];
  for (const n of items) {
    const day = dayLabel(n.createdAt);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(n);
    else groups.push({ day, items: [n] });
  }

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title={t('Notifications', 'Notifications')} backHref="/" backText={t('Accueil', 'Home')} backLabel={t('Retour à l’accueil', 'Back home')} />

      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-4 pb-16">
        {ready && !session ? (
          <section className="flex flex-col items-center gap-3 rounded-[28px] bg-[#1f2c33] p-6 text-center">
            <p className="text-[15px] font-medium">{t('Connecte-toi pour voir tes notifications', 'Sign in to see your notifications')}</p>
            <Link href="/compte" className="h-11 rounded-full bg-[#00a884] px-6 text-[14.5px] leading-[44px] font-semibold text-[#0b141a]">
              {t('Se connecter', 'Sign in')}
            </Link>
          </section>
        ) : loading && items.length === 0 ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-[24px] bg-[#1f2c33]" />
            ))}
          </div>
        ) : error && items.length === 0 ? (
          <p className="rounded-[24px] bg-[#1f2c33] px-4 py-6 text-center text-[14px] text-[#f15c6d]">{error}</p>
        ) : items.length === 0 ? (
          <section className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-[#1f2c33] text-[#8696a0]">
              <Icon.Bell size={30} />
            </span>
            <p className="text-[16px] font-medium">{t('Aucune notification', 'No notifications')}</p>
            <p className="text-[13.5px] text-[#8696a0]">
              {t(
                'Tes gains, dépôts, retraits, invitations d’amis, bonus de parrainage et les annonces de LuChat s’afficheront ici.',
                'Your winnings, deposits, withdrawals, friend requests, referral bonuses and LuChat announcements will show here.',
              )}
            </p>
          </section>
        ) : (
          <>
            {groups.map((group) => (
              <section key={group.day}>
                <h2 className="px-1 pb-2 text-[13px] font-medium text-[#8696a0] first-letter:uppercase">{group.day}</h2>
                <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-[24px] bg-[#1f2c33]">
                  {group.items.map((n) => (
                    <li key={n.id}>
                      <NotificationRow notification={n} unseen={n.id > seenUpTo} time={time.format(n.createdAt)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {more && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void load(items.at(-1)?.id)}
                className="mx-auto h-10 rounded-full px-5 text-[14px] font-semibold text-[#00a884] active:bg-white/5 disabled:opacity-50"
              >
                {loading ? t('Chargement…', 'Loading…') : t('Voir plus', 'Show more')}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function NotificationRow({ notification: n, unseen, time }: { notification: AppNotification; unseen: boolean; time: string }) {
  const { icon: KindIcon, tone } = KIND_STYLE[n.kind] ?? KIND_STYLE.announcement;
  const content = (
    <div className={`flex items-start gap-3 px-4 py-3.5 ${unseen ? 'bg-[#00a884]/[0.07]' : ''}`}>
      <span className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-full ${tone}`}>
        <KindIcon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-[15px] leading-snug ${unseen ? 'font-semibold' : 'font-medium'}`}>{n.title}</p>
          <span className="shrink-0 text-[11.5px] text-[#8696a0] tabular-nums">{time}</span>
        </div>
        <p className="mt-0.5 text-[13.5px] leading-snug whitespace-pre-line text-[#aebac1]">{n.body}</p>
      </div>
      {unseen && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-[#00a884]" aria-label="Nouveau" />}
    </div>
  );
  return n.url ? (
    <Link href={n.url} className="block active:bg-white/5">
      {content}
    </Link>
  ) : (
    content
  );
}
