'use client';

import { Icon } from '@/components/Icons';
import { LudoLogo } from '@/components/LudoLogo';
import { RoomHub, type RoomPerk } from '@/components/RoomHub';
import { getSessionToken } from '@/lib/profile';
import { getSocket, storeRoomToken } from '@/lib/socket';

const PERKS: RoomPerk[] = [
  { icon: Icon.Groups, title: 'De 2 à 4 joueurs', text: 'Invite jusqu’à 3 amis avec le code.' },
  { icon: Icon.Tune, title: 'Règles au choix', text: 'Cases sûres, blocages, équipes 2 contre 2…' },
  { icon: Icon.Robot, title: 'Ordinateurs', text: 'Complète les places libres.', friendlyOnly: true },
  { icon: Icon.QrCode, title: 'Invitation facile', text: 'WhatsApp, lien ou QR code.' },
];

function createRoom(name: string, wager: string | null) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Impossible de joindre le serveur de jeu.')), 5000);
    getSocket().emit('room:create', { name, auth: getSessionToken(), wager }, (res) => {
      clearTimeout(timeout);
      if (!res.ok) return reject(new Error(res.error));
      storeRoomToken(res.code, res.token);
      resolve(res.code);
    });
  });
}

export default function OnlinePage() {
  return (
    <RoomHub
      title="Jouer en ligne"
      subtitle="Salon privé entre amis"
      backHref="/ludo"
      backText="Ludo"
      backLabel="Retour à Ludo"
      logo={<LudoLogo size={58} float={false} />}
      heroTitle="Joue avec tes amis"
      heroText="Une partie de Ludo privée, chacun sur son téléphone."
      heroClass="bg-gradient-to-br from-sky-600/35 via-indigo-600/20 to-[#1f2c33]"
      perks={PERKS}
      joinPath={(code) => `/online/${code}`}
      onCreate={createRoom}
    />
  );
}
