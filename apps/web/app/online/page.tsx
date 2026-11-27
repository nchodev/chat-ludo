'use client';

import { Icon } from '@/components/Icons';
import { LudoLogo } from '@/components/LudoLogo';
import { RoomHub, type RoomPerk } from '@/components/RoomHub';
import { getSessionToken } from '@/lib/profile';
import { getSocket, storeRoomToken } from '@/lib/socket';
import { tr, useLang } from '@/lib/i18n';


function createRoom(name: string, wager: string | null) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(tr('Impossible de joindre le serveur de jeu.', 'Could not reach the game server.'))), 5000);
    getSocket().emit('room:create', { name, auth: getSessionToken(), wager }, (res) => {
      clearTimeout(timeout);
      if (!res.ok) return reject(new Error(res.error));
      storeRoomToken(res.code, res.token);
      resolve(res.code);
    });
  });
}

export default function OnlinePage() {
  const { t } = useLang();
  const PERKS: RoomPerk[] = [
    { icon: Icon.Groups, title: t('De 2 à 4 joueurs', '2 to 4 players'), text: t('Invite jusqu’à 3 amis avec le code.', 'Invite up to 3 friends with the code.') },
    { icon: Icon.Tune, title: t('Règles au choix', 'Choose the rules'), text: t('Cases sûres, blocages, équipes 2 contre 2…', 'Safe squares, blocks, teams 2 v 2…') },
    { icon: Icon.Robot, title: t('Ordinateurs', 'Computer players'), text: t('Complète les places libres.', 'Fill the free seats.'), friendlyOnly: true },
    { icon: Icon.QrCode, title: t('Invitation facile', 'Easy invitation'), text: t('WhatsApp, lien ou QR code.', 'WhatsApp, link or QR code.') },
  ];
  return (
    <RoomHub
      title={t('Jouer en ligne', 'Play online')}
      subtitle={t('Salon privé entre amis', 'Private room with friends')}
      backHref="/ludo"
      backText="Ludo"
      backLabel={t('Retour à Ludo', 'Back to Ludo')}
      logo={<LudoLogo size={58} float={false} />}
      heroTitle={t('Joue avec tes amis', 'Play with your friends')}
      heroText={t('Une partie de Ludo privée, chacun sur son téléphone.', 'A private game of Ludo, each on their own phone.')}
      heroClass="bg-gradient-to-br from-sky-600/35 via-indigo-600/20 to-[#1f2c33]"
      perks={PERKS}
      joinPath={(code) => `/online/${code}`}
      onCreate={createRoom}
    />
  );
}
