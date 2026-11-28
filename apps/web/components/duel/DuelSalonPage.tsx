'use client';

import { DUEL_INCREMENT_MS, DUEL_MINUTES, type DuelGame } from '@ludo/engine';
import { Icon } from '@/components/Icons';
import { RoomHub, type RoomPerk } from '@/components/RoomHub';
import { getSessionToken } from '@/lib/profile';
import { getSocket, storeDraughtsToken } from '@/lib/socket';
import { DUEL_UI } from './duelGames';
import { tr, useLang } from '@/lib/i18n';

const firstPerk = (kind: DuelGame): RoomPerk =>
  kind === 'dames'
    ? { icon: Icon.Crown, title: tr('Un contre un', 'One on one'), text: tr('Dames internationales, 100 cases.', 'International draughts, 100 squares.') }
    : { icon: Icon.Groups, title: tr('Un contre un', 'One on one'), text: tr('Awalé classique, 2 × 6 trous, 48 graines.', 'Classic Awalé, 2 × 6 pits, 48 seeds.') };

const HERO_CLASS: Record<DuelGame, string> = {
  dames: 'bg-gradient-to-br from-amber-700/40 via-stone-700/20 to-[#1f2c33]',
  awale: 'bg-gradient-to-br from-orange-800/45 via-amber-900/20 to-[#1f2c33]',
};

export function createDuelRoom(kind: DuelGame, name: string, wager: string | null) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(tr('Impossible de joindre le serveur de jeu.', 'Could not reach the game server.'))), 5000);
    getSocket().emit('draughts:create', { game: kind, name, auth: getSessionToken(), wager }, (res) => {
      clearTimeout(timeout);
      if (!res.ok) return reject(new Error(res.error));
      storeDraughtsToken(res.code, res.token);
      resolve(res.code);
    });
  });
}

/** Entry of the private rooms of a two-player game: create one, or join with a code. */
export function DuelSalonPage({ kind }: { kind: DuelGame }) {
  const ui = DUEL_UI[kind];
  const { t } = useLang();
  const perks: RoomPerk[] = [
    firstPerk(kind),
    { icon: Icon.Timer, title: t(`${DUEL_MINUTES[0]} à ${DUEL_MINUTES[DUEL_MINUTES.length - 1]} min chacun`, `${DUEL_MINUTES[0]} to ${DUEL_MINUTES[DUEL_MINUTES.length - 1]} min each`), text: t(`Au choix de l’hôte, + ${DUEL_INCREMENT_MS / 1000} s par coup.`, `Host’s choice, + ${DUEL_INCREMENT_MS / 1000} s per move.`) },
    { icon: Icon.Eye, title: t('Spectateurs', 'Spectators'), text: t('D’autres amis peuvent regarder.', 'Other friends can watch.') },
    { icon: Icon.QrCode, title: t('Invitation facile', 'Easy invitation'), text: t('WhatsApp, lien ou QR code.', 'WhatsApp, link or QR code.') },
  ];
  return (
    <RoomHub
      title={t('Salon privé', 'Private room')}
      subtitle={t(`Défie un ami ${ui.inviteGame}`, `Challenge a friend to ${ui.inviteGame}`)}
      backHref={ui.base}
      backText={ui.name}
      backLabel={t(`Retour : ${ui.name}`, `Back: ${ui.name}`)}
      logo={ui.logo(58)}
      heroTitle={t('Défie un ami', 'Challenge a friend')}
      heroText={t(
        `Une partie ${kind === 'dames' ? 'de dames' : 'd’awalé'} privée, chacun sur son téléphone.`,
        `A private game of ${kind === 'dames' ? 'draughts' : 'Awalé'}, each on their own phone.`,
      )}
      heroClass={HERO_CLASS[kind]}
      perks={perks}
      joinPath={(code) => `${ui.base}/salon/${code}`}
      onCreate={(name, wager) => createDuelRoom(kind, name, wager)}
    />
  );
}
