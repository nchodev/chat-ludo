import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalList, LegalPage, LegalSection } from '@/components/LegalPage';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Politique de confidentialité · LuChat' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Confidentialité" subtitle="Ce que nous faisons de tes données">
      <LegalSection title="1. Responsable du traitement">
        <p>
          Tes données sont traitées par {LEGAL.operator}, {LEGAL.address}. Pour toute question sur tes données : {LEGAL.contactEmail}.
        </p>
      </LegalSection>

      <LegalSection title="2. Données collectées">
        <LegalList
          items={[
            <>
              <strong>Compte</strong> : pseudo, mot de passe (enregistré sous forme hachée, jamais en clair), date de création, parrain éventuel.
            </>,
            <>
              <strong>Jeu</strong> : progression, niveau, badges, classement, parties jouées. Pour les parties avec mise : joueurs, horodatages, coups,
              lancers de dés, vainqueur et cagnotte.
            </>,
            <>
              <strong>Portefeuille</strong> : chaque mouvement de pièces Free et Premium (gains, mises, achats, dépôts, retraits) avec son motif.
            </>,
            <>
              <strong>Paiements</strong> : ton numéro Wave, le montant et l’état de chaque dépôt et retrait, et la référence de la transaction chez Wave.
              Nous ne recevons jamais ton code secret Wave.
            </>,
            <>
              <strong>Sécurité</strong> : adresse IP et identifiant de l’appareil (pour empêcher les comptes multiples et la collusion), attestation de
              majorité avec sa date et l’adresse IP utilisée.
            </>,
            <>
              <strong>Messagerie</strong> : amis, groupes, messages, photos et messages vocaux que tu envoies, signalements.
            </>,
            <>
              <strong>Notifications</strong> : si tu les actives, l’adresse technique fournie par ton navigateur pour t’envoyer des notifications.
            </>,
          ]}
        />
        <p>
          Sur ton appareil, l’application garde aussi tes préférences (apparence, son), ta session et, en mode invité, ta progression. Nous n’utilisons ni
          cookie publicitaire ni outil de suivi publicitaire.
        </p>
      </LegalSection>

      <LegalSection title="3. Pourquoi nous les utilisons">
        <LegalList
          items={[
            'Faire fonctionner ton compte, les parties en ligne, le classement et la messagerie.',
            'Gérer les pièces, les mises, les dépôts et les retraits, et pouvoir prouver chaque opération.',
            'Lutter contre la fraude, la triche, les comptes multiples et l’accès des mineurs au mode Premium.',
            'Modérer la messagerie quand un message est signalé.',
            'Respecter nos obligations légales, notamment de conservation des opérations financières.',
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Qui y a accès">
        <LegalList
          items={[
            'L’équipe LuChat, uniquement pour le support, la modération, le traitement des retraits et la lutte contre la fraude. Chaque action est journalisée.',
            'Wave, pour les paiements : ton numéro et le montant lui sont transmis lors d’un dépôt ; tes retraits sont envoyés depuis notre compte Wave Business.',
            'Le service de notifications de ton navigateur (Google, Apple, Mozilla…), seulement si tu actives les notifications.',
            'Notre hébergeur, qui stocke les données pour notre compte.',
            'Les autorités, sur demande légale.',
          ]}
        />
        <p>Les autres joueurs voient ton pseudo, ton avatar, ton niveau et ton classement. Nous ne vendons jamais tes données.</p>
      </LegalSection>

      <LegalSection title="5. Durée de conservation">
        <LegalList
          items={[
            'Les sessions de connexion expirent au bout de 60 jours.',
            'Les données du compte, de jeu et de messagerie sont conservées tant que le compte existe.',
            'Les mouvements de pièces, les paiements et les archives des parties avec mise sont conservés même après la fermeture du compte, pendant la durée exigée par la loi, car ils servent de preuve en cas de litige ou de contrôle.',
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Sécurité">
        <p>
          Les échanges avec LuChat sont chiffrés (HTTPS), les mots de passe sont hachés, les clés de paiement ne quittent jamais nos serveurs et l’accès à
          l’administration est réservé à l’équipe. Aucune mesure n’étant infaillible, garde ton mot de passe secret et préviens-nous de tout accès
          suspect.
        </p>
      </LegalSection>

      <LegalSection title="7. Tes droits">
        <p>
          Conformément à la loi ivoirienne n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel, tu peux demander
          l’accès à tes données, leur correction, leur suppression ou t’opposer à certains traitements, en écrivant à {LEGAL.contactEmail}. La suppression
          du compte n’efface pas les données que la loi nous oblige à conserver (voir point 5). Tu peux aussi saisir l’ARTCI (Autorité de Régulation des
          Télécommunications/TIC de Côte d’Ivoire).
        </p>
      </LegalSection>

      <LegalSection title="8. Mineurs">
        <p>
          Le mode Premium (achats, retraits et mises en pièces Premium) est interdit aux moins de 18 ans. Si nous apprenons qu’un compte Premium est utilisé
          par une personne mineure, nous le suspendons.
        </p>
      </LegalSection>

      <LegalSection title="9. Modifications">
        <p>
          Cette politique peut évoluer ; la date de mise à jour figure en haut de la page. Voir aussi les{' '}
          <Link href="/conditions" className="font-semibold text-[#00a884]">
            conditions d’utilisation
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
