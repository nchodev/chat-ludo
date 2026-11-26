'use client';

import type { DuelGame } from '@ludo/engine';
import { Icon } from '@/components/Icons';
import { RoomHub, type RoomPerk } from '@/components/RoomHub';
import { getSessionToken } from '@/lib/profile';
import { getSocket, storeDraughtsToken } from '@/lib/socket';
import { DUEL_UI } from './duelGames';

const FIRST_PERK: Record<DuelGame, RoomPerk> = {
  dames: { icon: Icon.Crown, title: 'Un contre un', text: 'Dames internationales, 100 cases.' },
  awale: { icon: Icon.Groups, title: 'Un contre un', text: 'Awalé classique, 2 × 6 trous, 48 graines.' },
};

const HERO_CLASS: Record<DuelGame, string> = {
  dames: 'bg-gradient-to-br from-amber-700/40 via-stone-700/20 to-[#1f2c33]',
  awale: 'bg-gradient-to-br from-orange-800/45 via-amber-900/20 to-[#1f2c33]',
};

export function createDuelRoom(kind: DuelGame, name: string, wager: string | null) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Impossible de joindre le serveur de jeu.')), 5000);
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
  const perks: RoomPerk[] = [
    FIRST_PERK[kind],
    { icon: Icon.Timer, title: `${ui.clockMs / 60_000} minutes chacun`, text: 'Pendule pour chaque joueur.' },
    { icon: Icon.Eye, title: 'Spectateurs', text: 'D’autres amis peuvent regarder.' },
    { icon: Icon.QrCode, title: 'Invitation facile', text: 'WhatsApp, lien ou QR code.' },
  ];
  return (
    <RoomHub
      title="Salon privé"
      subtitle={`Défie un ami ${ui.inviteGame}`}
      backHref={ui.base}
      backText={ui.name}
      backLabel={`Retour : ${ui.name}`}
      logo={ui.logo(58)}
      heroTitle="Défie un ami"
      heroText={`Une partie ${kind === 'dames' ? 'de dames' : 'd’awalé'} privée, chacun sur son téléphone.`}
      heroClass={HERO_CLASS[kind]}
      perks={perks}
      joinPath={(code) => `${ui.base}/salon/${code}`}
      onCreate={(name, wager) => createDuelRoom(kind, name, wager)}
    />
  );
}
