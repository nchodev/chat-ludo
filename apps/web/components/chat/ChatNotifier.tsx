'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { AppNotification, ChatMessageView, SupportMessageView, WalletChange } from '@ludo/engine';
import { getViewingChat, requestOpenChat } from '@/lib/chat';
import { clearNotifications, receiveNotification, refreshUnread } from '@/lib/notifications';
import { getSessionToken, refreshProfile, useProfile } from '@/lib/profile';
import { showLocalNotification } from '@/lib/push';
import { getSocket } from '@/lib/socket';
import { clearSupport, receiveSupport, refreshSupportUnread } from '@/lib/support';
import { CoinIcon, GemIcon } from '../Coins';
import { Icon } from '../Icons';
import { Avatar } from './Avatar';
import { messagePreview } from './format';

const BANNER_MS = 4500;
const WALLET_TOAST_MS = 6000;

function chatUrl(username: string) {
  return `/?chat=${encodeURIComponent(username)}`;
}

/** Friend's username, or the group's key. */
function conversationOf(message: ChatMessageView) {
  return message.group ? message.to : message.from;
}

function titleOf(message: ChatMessageView) {
  return message.group ? (message.groupName ?? 'Groupe') : message.from;
}

function bannerText(message: ChatMessageView) {
  return message.group ? `${message.from} : ${messagePreview(message)}` : messagePreview(message);
}

/**
 * Keeps the signed-in player reachable on every screen: a banner for messages received while
 * the app is open, a system notification while it is in the background.
 */
export function ChatNotifier() {
  const { session } = useProfile();
  const signedIn = !!session;
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const [banner, setBanner] = useState<{ message: ChatMessageView; key: number } | null>(null);
  const [localCode, setLocalCode] = useState<{ from: string; code: string; expiresAt: number } | null>(null);
  const [wallet, setWallet] = useState<(WalletChange & { key: number }) | null>(null);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const open = (username: string) => {
    setBanner(null);
    if (pathRef.current === '/' && requestOpenChat(username)) return;
    router.push(chatUrl(username));
  };
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });

  useEffect(() => {
    if (!signedIn) return;
    const socket = getSocket();
    const auth = () => {
      const token = getSessionToken();
      if (token) socket.emit('chat:auth', { auth: token }, () => {});
    };
    const onMessage = (message: ChatMessageView) => {
      if (message.mine || message.kind === 'system') return;
      const hidden = document.visibilityState === 'hidden';
      const key = conversationOf(message);
      if (!hidden && getViewingChat() === key) return;
      if (hidden) {
        void showLocalNotification(titleOf(message), bannerText(message), `chat-${key}`, chatUrl(key));
        return;
      }
      navigator.vibrate?.(60);
      setBanner({ message, key: message.id });
    };
    const onLocalCode = ({ from, code, expiresIn }: { from: string; code: string; expiresIn: number }) => {
      navigator.vibrate?.([80, 60, 80]);
      setLocalCode({ from, code, expiresAt: Date.now() + expiresIn });
      if (document.visibilityState === 'hidden') {
        void showLocalNotification(`Code LuChat : ${code}`, `${from} veut t’ajouter à une partie avec mise sur son téléphone.`, 'local-code', '/');
      }
    };
    const onWallet = (change: WalletChange) => {
      void refreshProfile();
      setWallet({ ...change, key: Date.now() });
      navigator.vibrate?.(change.delta > 0 ? 40 : [60, 40, 60]);
      // Other moves arrive as a notification of the bell too, which shows them (see onNotification).
      if (document.visibilityState === 'hidden' && change.reason === 'stake') {
        const { title, body } = walletText(change);
        void showLocalNotification(title, body, 'wallet', '/compte');
      }
    };
    const onNotification = (notification: AppNotification) => {
      receiveNotification(notification);
      if (document.visibilityState === 'hidden') {
        void showLocalNotification(notification.title, notification.body, `notif-${notification.id}`, notification.url ?? '/notifications');
      }
    };
    const onSupport = (message: SupportMessageView) => receiveSupport(message);
    const onReconnect = () => {
      void refreshUnread();
      void refreshSupportUnread();
    };
    socket.on('connect', auth);
    socket.on('chat:message', onMessage);
    socket.on('local:code', onLocalCode);
    socket.on('wallet:changed', onWallet);
    socket.on('notification:new', onNotification);
    socket.on('connect', onReconnect);
    socket.on('support:message', onSupport);
    void refreshUnread();
    void refreshSupportUnread();
    if (socket.connected) auth();
    else socket.connect();
    return () => {
      socket.off('connect', auth);
      socket.off('chat:message', onMessage);
      socket.off('local:code', onLocalCode);
      socket.off('wallet:changed', onWallet);
      socket.off('notification:new', onNotification);
      socket.off('connect', onReconnect);
      socket.off('support:message', onSupport);
      clearNotifications();
      clearSupport();
      socket.emit('chat:logout');
    };
  }, [signedIn]);

  // Tapping a system notification while the app is open.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'open-url') return;
      const chat = new URL(e.data.url).searchParams.get('chat');
      if (chat) openRef.current(chat);
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
  }, []);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    if (!localCode) return;
    const timer = setTimeout(() => setLocalCode(null), Math.max(0, localCode.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [localCode]);

  useEffect(() => {
    if (!wallet) return;
    const timer = setTimeout(() => setWallet(null), WALLET_TOAST_MS);
    return () => clearTimeout(timer);
  }, [wallet]);

  if (localCode) return <LocalCodeDialog {...localCode} onClose={() => setLocalCode(null)} />;
  if (!banner) return wallet ? <WalletToast key={wallet.key} change={wallet} onClose={() => setWallet(null)} /> : null;
  const { message } = banner;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <button
        key={banner.key}
        type="button"
        onClick={() => open(conversationOf(message))}
        className="banner-down pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[22px] border border-white/5 bg-[#1f2c33]/95 p-3 text-left shadow-2xl shadow-black/50 backdrop-blur-md"
      >
        <Avatar name={titleOf(message)} group={!!message.group} size={42} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-semibold text-[#e9edef]">{titleOf(message)}</span>
            <span className="shrink-0 text-[11px] text-[#8696a0]">maintenant</span>
          </span>
          <span className="line-clamp-2 text-[14px] leading-snug text-[#d1d7db]">{bannerText(message)}</span>
        </span>
      </button>
    </div>
  );
}

/** Code to read out to the friend whose phone hosts a staked game, so they can seat you. */
function LocalCodeDialog({ from, code, expiresAt, onClose }: { from: string; code: string; expiresAt: number; onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.round((expiresAt - now) / 1000));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Code de partie">
      <div className="pop-in w-full max-w-sm rounded-[28px] bg-[#1f2c33] p-6 text-center shadow-2xl">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#00a884]/15 text-[#00a884]">
          <Icon.Shield size={30} />
        </span>
        <h2 className="mt-3 text-[19px] font-semibold text-[#e9edef]">Code de partie</h2>
        <p className="mt-1 text-[14px] leading-snug text-[#8696a0]">
          <span className="font-semibold text-[#e9edef]">{from}</span> veut t’ajouter à une partie avec mise sur son téléphone.
        </p>
        <p className="my-5 font-mono text-[40px] leading-none font-bold tracking-[0.25em] text-[#e9edef]">{code}</p>
        <p className="flex items-start gap-2 rounded-2xl bg-[#ffbc38]/10 px-3 py-2.5 text-left text-[13px] leading-snug text-[#ffd279]">
          <Icon.Info size={18} className="mt-px shrink-0" />
          Saisis-le seulement si tu es à côté de {from} : ta mise sera prélevée sur ton compte au lancement.
        </p>
        <p className="mt-3 text-[12.5px] text-[#8696a0]">
          Expire dans {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] active:opacity-90"
        >
          J’ai donné le code
        </button>
        <button type="button" onClick={onClose} className="mt-2 h-10 w-full text-[14px] font-medium text-[#8696a0]">
          Ignorer
        </button>
      </div>
    </div>
  );
}

function walletText({ currency, delta, reason, note, amount: sent }: WalletChange) {
  const amount = `${Math.abs(delta)} ${currency === 'premium' ? 'Premium' : 'Free'}`;
  if (reason === 'deposit') return { title: `${amount} crédités`, body: 'Ton dépôt Wave est arrivé sur ton compte.' };
  if (reason === 'referral_welcome') {
    return { title: `Bonus de bienvenue : +${amount}`, body: 'Merci pour ton premier dépôt ! Mise ce bonus en parties pour pouvoir le retirer.' };
  }
  if (reason === 'referral_deposit') {
    return { title: `Bonus parrainage : +${amount}`, body: 'Un ami invité a fait son premier dépôt. Mise ce bonus en parties pour pouvoir le retirer.' };
  }
  if (reason === 'withdrawal_paid') return { title: `Retrait de ${sent ?? 0} F envoyé`, body: 'L’argent a été envoyé sur ton compte Wave.' };
  if (reason === 'withdrawal_refund') return { title: `Retrait de ${Math.abs(delta)} F refusé`, body: `${note ? `${note} ` : ''}Tes pièces Premium t’ont été rendues.` };
  if (reason === 'admin') {
    return { title: delta > 0 ? `${amount} crédités par l’équipe LuChat` : `${amount} retirés par l’équipe LuChat`, body: note ?? '' };
  }
  if (reason === 'stake') return { title: `Mise de ${amount} prélevée`, body: 'Ta mise est dans la cagnotte de la partie qui commence.' };
  if (reason === 'prize') return { title: `Tu as gagné ${amount} !`, body: 'La cagnotte de la partie a été créditée sur ton compte.' };
  if (reason === 'forfeit') return { title: `Mise de ${amount} perdue`, body: 'La partie a été quittée avant la fin sur le téléphone où elle se jouait.' };
  return { title: `${amount} remboursés`, body: 'La partie n’a pas pu se terminer : ta mise t’a été rendue.' };
}

/** Debits, prizes and refunds of staked games, even those played on someone else's phone. */
function WalletToast({ change, onClose }: { change: WalletChange; onClose: () => void }) {
  const { title, body } = walletText(change);
  const balance = change.balance[change.currency];
  const CurrencyIcon = change.currency === 'premium' ? GemIcon : CoinIcon;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div
        role="status"
        className="banner-down pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[22px] border border-white/5 bg-[#1f2c33]/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-md"
      >
        <span
          className={`grid size-[42px] shrink-0 place-items-center rounded-full ${
            change.reason === 'forfeit' ? 'bg-[#f15c6d]/15' : change.delta < 0 ? 'bg-[#ffbc38]/15' : 'bg-[#00a884]/15'
          }`}
        >
          <CurrencyIcon size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-semibold text-[#e9edef]">{title}</span>
            {change.delta !== 0 && (
              <span className={`shrink-0 text-[14px] font-bold tabular-nums ${change.reason === 'forfeit' ? 'text-[#f15c6d]' : change.delta < 0 ? 'text-[#ffbc38]' : 'text-[#25d366]'}`}>
                {change.delta > 0 ? '+' : '−'}
                {Math.abs(change.delta)}
              </span>
            )}
          </span>
          <span className="block text-[13px] leading-snug text-[#8696a0]">
            {body} Solde : {balance}.
          </span>
        </span>
        <button type="button" onClick={onClose} aria-label="Fermer" className="grid size-8 shrink-0 place-items-center rounded-full text-[#8696a0] active:bg-white/10">
          <Icon.Close size={18} />
        </button>
      </div>
    </div>
  );
}
