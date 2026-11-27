'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icons';
import { useLang } from '@/lib/i18n';
import { useNotifications } from '@/lib/notifications';
import { useProfile } from '@/lib/profile';

/** The bell of the top bar, with the number of notifications not seen yet. */
export function NotificationBell() {
  const { session } = useProfile();
  const { unread } = useNotifications();
  const { t } = useLang();
  if (!session) return null;
  const label = unread > 0 ? t(`Notifications, ${unread} non lues`, `Notifications, ${unread} unread`) : t('Notifications', 'Notifications');
  return (
    <Link href="/notifications" aria-label={label} className="relative grid size-10 shrink-0 place-items-center rounded-full text-[#aebac1] active:bg-white/10">
      <Icon.Bell size={24} />
      {unread > 0 && (
        <span className="absolute top-1 right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#f15c6d] px-1 text-[11px] leading-none font-bold text-white tabular-nums ring-2 ring-[#1f2c33]">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
