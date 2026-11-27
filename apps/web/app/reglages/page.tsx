'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { AppBar } from '@/components/AppBar';
import { AppearancePicker } from '@/components/AppearancePicker';
import { AppLockSetting } from '@/components/AppLockSetting';
import { ColorPreference } from '@/components/ColorPreference';
import { Icon } from '@/components/Icons';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ListRow, RowIcon, SectionTitle } from '@/components/MobileList';
import { Sheet } from '@/components/Sheet';
import { useAppearance } from '@/lib/appearance';
import { useLang } from '@/lib/i18n';
import { getSessionToken, logout, useProfile } from '@/lib/profile';
import { disablePush, enablePush, pushStatus, type PushStatus } from '@/lib/push';
import { isMuted, onMutedChange, setMuted } from '@/lib/sound';

/** On/off switch, same look as the fingerprint lock. */
function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${on ? 'bg-[#00a884]' : 'bg-white/15'}`}
    >
      <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${on ? 'left-7' : 'left-1'}`} />
    </button>
  );
}

/** A group of settings rows on one rounded card. */
function Group({ children }: { children: ReactNode }) {
  return <div className="mx-4 divide-y divide-white/[0.06] overflow-hidden rounded-[24px] bg-[#1f2c33]">{children}</div>;
}

const chevron = <Icon.ChevronRight className="shrink-0 text-[#8696a0]" />;

function SoundRow() {
  const { t } = useLang();
  const [muted, setMutedState] = useState(false);
  useEffect(() => {
    setMutedState(isMuted());
    return onMutedChange(setMutedState);
  }, []);
  return (
    <ListRow
      leading={<RowIcon color="#53bdeb">{muted ? <Icon.VolumeOff size={22} /> : <Icon.Volume size={22} />}</RowIcon>}
      title={t('Sons du jeu', 'Game sounds')}
      subtitle={muted ? t('Coupés', 'Off') : t('Activés', 'On')}
      trailing={<Switch on={!muted} label={t('Sons du jeu', 'Game sounds')} onChange={() => setMuted(!muted)} />}
    />
  );
}

function NotificationsRow() {
  const { t } = useLang();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void pushStatus().then(setStatus);
  }, []);

  const toggle = async () => {
    const token = getSessionToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      if (status === 'on') {
        await disablePush(token);
        setStatus('off');
      } else {
        setStatus(await enablePush(token));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Impossible pour le moment.', 'Not possible right now.'));
    } finally {
      setBusy(false);
    }
  };

  const subtitle =
    status === 'unsupported'
      ? t('Non disponibles sur ce navigateur : installe l’app.', 'Not available in this browser: install the app.')
      : status === 'denied'
        ? t('Bloquées dans les réglages du téléphone.', 'Blocked in your phone’s settings.')
        : status === 'on'
          ? t('Messages, défis et parties', 'Messages, challenges and games')
          : t('Désactivées sur cet appareil', 'Off on this device');

  return (
    <>
      <ListRow
        leading={
          <RowIcon color="#ffbc38">
            <Icon.Bell size={22} />
          </RowIcon>
        }
        title={t('Notifications', 'Notifications')}
        subtitle={subtitle}
        trailing={
          <Switch
            on={status === 'on'}
            label={t('Notifications', 'Notifications')}
            disabled={busy || status === null || status === 'unsupported' || status === 'denied'}
            onChange={() => void toggle()}
          />
        }
      />
      {error && <p className="px-5 pb-3 text-[13px] text-[#f15c6d]">{error}</p>}
    </>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useLang();
  const { session, fullName } = useProfile();
  const { board } = useAppearance();
  const [sheet, setSheet] = useState<'appearance' | 'color' | null>(null);

  const signOut = async () => {
    if (!confirm(t('Se déconnecter de LuChat sur cet appareil ?', 'Sign out of LuChat on this device?'))) return;
    await logout();
    router.push('/?tab=profile');
  };

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title={t('Réglages', 'Settings')} backHref="/?tab=profile" backText={t('Profil', 'Profile')} backLabel={t('Retour au profil', 'Back to profile')} />

      <main className="mx-auto max-w-lg pb-12">
        <SectionTitle>{t('Compte', 'Account')}</SectionTitle>
        <Group>
          {session ? (
            <Link href="/compte" className="flex items-center gap-4 px-5 py-3 transition active:bg-white/5">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-400 to-indigo-600 text-xl font-bold">
                {session.username[0].toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-medium">{session.username}</span>
                <span className="block truncate text-[13.5px] text-[#8696a0]">
                  {fullName ?? t('Ajoute ton nom complet', 'Add your full name')}
                </span>
              </span>
              {chevron}
            </Link>
          ) : (
            <Link href="/compte" className="flex items-center gap-4 px-5 py-3 transition active:bg-white/5">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/10 text-[#8696a0]">
                <Icon.Person size={26} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-medium">{t('Créer un compte', 'Create an account')}</span>
                <span className="block text-[13.5px] text-[#8696a0]">{t('Ou se connecter', 'Or sign in')}</span>
              </span>
              {chevron}
            </Link>
          )}
        </Group>

        <SectionTitle>{t('Préférences', 'Preferences')}</SectionTitle>
        <div className="mx-4 flex flex-col gap-2">
          <LanguageSwitcher />
        </div>
        <div className="mt-2">
          <Group>
            <SoundRow />
            {session && <NotificationsRow />}
            <ListRow
              leading={
                <RowIcon color="#00a884">
                  <Icon.Palette size={22} />
                </RowIcon>
              }
              title={t('Apparence', 'Appearance')}
              subtitle={board.name}
              trailing={chevron}
              onClick={() => setSheet('appearance')}
            />
            <ListRow
              leading={
                <RowIcon color="#f15c6d">
                  <Icon.Dice size={22} />
                </RowIcon>
              }
              title={t('Ta couleur au Ludo', 'Your Ludo colour')}
              subtitle={t('Ton camp, toujours en bas du plateau', 'Your side, always at the bottom of the board')}
              trailing={chevron}
              onClick={() => setSheet('color')}
            />
          </Group>
        </div>

        {session && (
          <>
            <SectionTitle>{t('Sécurité', 'Security')}</SectionTitle>
            <div className="mx-4">
              <AppLockSetting username={session.username} />
            </div>
          </>
        )}

        <SectionTitle>{t('Aide', 'Help')}</SectionTitle>
        <Group>
          <Link href="/tutoriel" className="block">
            <ListRow
              leading={
                <RowIcon color="#a78bfa">
                  <Icon.School size={22} />
                </RowIcon>
              }
              title={t('Tutoriel du Ludo', 'Ludo tutorial')}
              subtitle={t('Apprendre à jouer en 2 minutes', 'Learn to play in 2 minutes')}
              trailing={chevron}
            />
          </Link>
        </Group>

        <SectionTitle>{t('À propos', 'About')}</SectionTitle>
        <Group>
          <Link href="/conditions" className="block">
            <ListRow
              leading={
                <RowIcon color="#8696a0">
                  <Icon.Doc size={22} />
                </RowIcon>
              }
              title={t('Conditions d’utilisation', 'Terms of use')}
              trailing={chevron}
            />
          </Link>
          <Link href="/confidentialite" className="block">
            <ListRow
              leading={
                <RowIcon color="#8696a0">
                  <Icon.Shield size={22} />
                </RowIcon>
              }
              title={t('Confidentialité', 'Privacy')}
              trailing={chevron}
            />
          </Link>
        </Group>

        {session && (
          <div className="mx-4 mt-6">
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#f15c6d]/12 text-[15px] font-semibold text-[#f15c6d] transition active:bg-[#f15c6d]/20"
            >
              <Icon.Logout size={20} />
              {t('Se déconnecter', 'Sign out')}
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-[12px] text-[#8696a0]">LuChat</p>
      </main>

      <Sheet open={sheet === 'appearance'} title={t('Apparence', 'Appearance')} onClose={() => setSheet(null)}>
        <AppearancePicker />
      </Sheet>
      <Sheet open={sheet === 'color'} title={t('Ta couleur au Ludo', 'Your Ludo colour')} onClose={() => setSheet(null)}>
        <ColorPreference />
      </Sheet>
    </div>
  );
}
