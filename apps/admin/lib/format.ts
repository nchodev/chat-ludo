export type Currency = 'free' | 'premium';

export const CURRENCY_NAME: Record<Currency, string> = { free: 'Free', premium: 'Premium' };

const number = new Intl.NumberFormat('fr-FR');
export const fmt = (n: number) => number.format(n);

export const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));

const dateTime = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
export const when = (ms: number) => dateTime.format(ms);

const dayOnly = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
export const day = (ms: number) => dayOnly.format(ms);

export function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

export const LEDGER_REASON: Record<string, string> = {
  stake: 'Mise',
  prize: 'Gain de cagnotte',
  refund: 'Remboursement',
  forfeit: 'Mise perdue (abandon)',
  admin: 'Ajustement admin',
  commission: 'Commission',
  daily: 'Bonus du jour',
  shop: 'Achat boutique',
  game: 'Partie (gains, défis, niveau)',
  tutorial: 'Tutoriel',
  quest: 'Défi de la semaine',
  referral: 'Parrainage',
  referral_deposit: 'Bonus parrainage (1er dépôt filleul)',
  referral_welcome: 'Bonus de bienvenue (1er dépôt)',
  tournament: 'Tournoi',
  deposit: 'Dépôt Mobile Money',
  withdrawal: 'Retrait Mobile Money',
  withdrawal_refund: 'Retrait refusé (remboursé)',
};

export const ACTION_LABEL: Record<string, string> = {
  'coins.credit': 'Crédit de pièces',
  'coins.debit': 'Retrait de pièces',
  'player.ban': 'Suspension',
  'player.unban': 'Réactivation',
  'player.password': 'Mot de passe changé',
  'room.close': 'Fermeture de salon',
  'report.delete': 'Message supprimé',
  'report.dismiss': 'Signalement classé',
  'settings.stakes': 'Réglages des mises',
  'settings.payments': 'Réglages des paiements',
  'settings.referral': 'Réglage du parrainage',
  'announcement.send': 'Annonce envoyée',
  'announcement.delete': 'Annonce supprimée',
  'game.enable': 'Jeu activé',
  'game.disable': 'Jeu désactivé',
  'admin.create': 'Admin ajouté',
  'admin.delete': 'Admin supprimé',
  'admin.password': 'Mot de passe changé',
  'withdrawal.paid': 'Retrait payé sur Wave',
  'withdrawal.refused': 'Retrait refusé',
  'deposit.checked': 'Dépôt revérifié auprès de Wave',
  'deposit.confirmed': 'Dépôt crédité à la main',
  'deposit.failed': 'Dépôt marqué non abouti',
  'wave_phone.reset': 'Numéro Wave délié',
};

export const SEAT_HEX: Record<string, string> = {
  red: '#e53935',
  green: '#43a047',
  yellow: '#fbc02d',
  blue: '#1e88e5',
  white: '#f1ece2',
  black: '#3b2a20',
};
