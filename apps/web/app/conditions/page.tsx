import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalList, LegalPage, LegalSection } from '@/components/LegalPage';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Conditions d’utilisation · LuChat' };

export default function TermsPage() {
  return (
    <LegalPage title="Conditions d’utilisation" subtitle="Règles d’utilisation de LuChat">
      <LegalSection title="1. Objet">
        <p>
          Ces conditions encadrent l’utilisation de LuChat : jeux en ligne (Ludo, dames, awalé), messagerie, parties avec mise en pièces Free ou Premium,
          et dépôts et retraits par Wave. En créant un compte ou en utilisant l’application, tu les acceptes. Si tu ne les acceptes pas, n’utilise pas
          LuChat.
        </p>
      </LegalSection>

      <LegalSection title="2. Éditeur">
        <p>
          LuChat est édité par {LEGAL.operator}, {LEGAL.address}, {LEGAL.registration}. Contact : {LEGAL.contactEmail}.
        </p>
      </LegalSection>

      <LegalSection title="3. Compte">
        <LegalList
          items={[
            'Un compte est personnel : une seule personne, un seul compte. Les comptes multiples sont interdits.',
            'Tu choisis un pseudo correct et un mot de passe que tu gardes secret. Tout ce qui est fait depuis ton compte est réputé fait par toi.',
            'Tu peux jouer sans compte (mode invité) ; ta progression reste alors sur ton appareil seulement.',
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Pièces Free et pièces Premium">
        <LegalList
          items={[
            <>
              <strong>Pièces Free</strong> : gagnées en jouant (bonus, victoires, parrainage). Elles n’ont aucune valeur monétaire, ne s’achètent pas et ne se
              retirent pas.
            </>,
            <>
              <strong>Pièces Premium</strong> : achetées avec Wave, à raison de 1 pièce = 1 F CFA. Les frais Wave sont pris en charge par LuChat. Elles servent
              aux parties Premium et peuvent être retirées sur ton compte Wave.
            </>,
            'Les montants minimum et maximum de dépôt et de retrait, ainsi que le plafond de retrait par 24 heures, sont affichés dans le Portefeuille avant chaque opération.',
            'Un dépôt n’est crédité qu’après confirmation du paiement par Wave. Un retrait débite tes pièces tout de suite ; l’équipe envoie ensuite l’argent sur ton compte Wave, en général sous 24 heures. Un retrait refusé est remboursé en pièces, avec le motif.',
            'Ton premier dépôt ou retrait lie définitivement ton numéro Wave à ton compte : les dépôts doivent venir de ce numéro et les retraits y sont envoyés. Un seul retrait peut être en cours à la fois.',
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Réservé aux majeurs">
        <p>
          Les parties et achats Premium sont strictement réservés aux personnes de 18 ans ou plus. Avant tout dépôt ou toute mise Premium, tu dois attester
          sur l’honneur être majeur ; cette attestation est enregistrée avec sa date. Un compte utilisé par une personne mineure peut être suspendu.
        </p>
      </LegalSection>

      <LegalSection title="6. Parties avec mise">
        <LegalList
          items={[
            'Chaque joueur mise la même somme au lancement de la partie. La mise est prélevée sur tous les joueurs à la fois, ou sur aucun.',
            'Le gagnant reçoit la cagnotte, moins une commission de la plateforme comprise entre 5 % et 10 %. Le gain exact est affiché avant de jouer.',
            'Le serveur de LuChat arbitre toute la partie : lancers de dés, coups autorisés, fin de partie. Les dés en ligne sont tirés de façon vérifiable (« dés équitables ») et chaque partie peut être vérifiée à la fin.',
            'Déconnexion : tu as 30 secondes pour revenir. Un tour non joué à temps est joué automatiquement ; trois tours manqués de suite valent abandon. Quitter volontairement une partie misée vaut abandon : ta mise revient aux autres joueurs.',
            'Si une partie ne peut pas aller à son terme à cause d’un incident technique de notre côté, les mises sont remboursées.',
            'Les parties sur un seul écran ne peuvent pas être misées en pièces Premium.',
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Jeu responsable">
        <p>
          Les pièces Premium représentent de l’argent réel et peuvent être perdues. Ne mise que ce que tu peux te permettre de perdre, fixe-toi des limites
          et fais des pauses. Si tu sens que tu perds le contrôle, arrête de jouer et contacte-nous : nous pouvons suspendre ton compte à ta demande,
          ton solde Premium restant remboursable.
        </p>
      </LegalSection>

      <LegalSection title="8. Comportements interdits">
        <LegalList
          items={[
            'Créer ou utiliser plusieurs comptes, jouer contre soi-même ou s’entendre avec d’autres joueurs pour fausser une partie (collusion).',
            'Utiliser un logiciel, un robot ou toute aide automatisée pour jouer, ou exploiter une faille de l’application.',
            'Utiliser un moyen de paiement ou un numéro Wave qui n’est pas le sien.',
            'Publier dans la messagerie des contenus illicites, haineux, violents, à caractère sexuel ou du harcèlement, ou usurper l’identité de quelqu’un.',
          ]}
        />
        <p>
          Pour protéger les parties misées, deux joueurs connectés depuis le même appareil ou, pour le Premium, la même adresse IP ne peuvent pas jouer
          ensemble.
        </p>
      </LegalSection>

      <LegalSection title="9. Sanctions">
        <p>
          En cas de manquement, LuChat peut supprimer un message, suspendre ou fermer un compte, et annuler les gains obtenus par fraude. Les pièces
          Premium achetées régulièrement et non liées à une fraude restent remboursables sur le numéro Wave du compte. Chaque action de l’équipe est
          enregistrée avec son motif.
        </p>
      </LegalSection>

      <LegalSection title="10. Disponibilité du service">
        <p>
          Nous faisons notre possible pour que LuChat fonctionne en continu, sans pouvoir le garantir. Un jeu, les dépôts, les retraits ou l’ensemble du
          mode Premium peuvent être suspendus temporairement, notamment pour maintenance ou sécurité. Dans ce cas, les parties en cours se terminent
          normalement et ton solde Premium reste à toi.
        </p>
      </LegalSection>

      <LegalSection title="11. Responsabilité">
        <p>
          LuChat n’est pas responsable des pertes de pièces dues à tes propres décisions de jeu, d’une mauvaise connexion de ton côté, ni d’un
          dysfonctionnement de Wave ou de ton opérateur. Tu es responsable de la sécurité de ton mot de passe et de ton téléphone.
        </p>
      </LegalSection>

      <LegalSection title="12. Données personnelles">
        <p>
          La façon dont nous traitons tes données est décrite dans la{' '}
          <Link href="/confidentialite" className="font-semibold text-[#00a884]">
            politique de confidentialité
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="13. Modifications">
        <p>
          Ces conditions peuvent évoluer. La date de mise à jour figure en haut de cette page ; en cas de changement important, tu seras prévenu dans
          l’application. Continuer à utiliser LuChat après un changement vaut acceptation.
        </p>
      </LegalSection>

      <LegalSection title="14. Droit applicable">
        <p>
          Ces conditions sont soumises au droit ivoirien. En cas de litige, contacte-nous d’abord pour chercher une solution à l’amiable ; à défaut, les
          tribunaux compétents d’Abidjan seront saisis.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
