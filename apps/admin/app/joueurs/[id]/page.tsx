'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icons';
import { PotsTable, type Pot } from '@/components/PotsTable';
import { Amount, Avatar, Badge, Dialog, Empty, ErrorBox, Loading, Segmented } from '@/components/ui';
import { adminApi, useAdminData } from '@/lib/api';
import { ACTION_LABEL, CURRENCY_NAME, LEDGER_REASON, ago, day, fmt, when, type Currency } from '@/lib/format';
import type { PlayerRow } from '@/lib/types';

interface Detail {
  player: PlayerRow;
  profile: { level?: number; xp: number; stats: { games: number; wins: number; captures?: number }; badges?: string[] };
  extra: { friends: number; messages: number; sessions: number; reportsAgainst: number };
  ledger: { id: number; currency: Currency; delta: number; reason: string; ref: string | null; createdAt: number }[];
  pots: Pot[];
  log: { id: number; admin: string | null; action: string; details: Record<string, unknown> | null; createdAt: number }[];
  wavePhone: string | null;
  adult: { at: number; ip: string | null } | null;
}

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useAdminData<Detail>(`/admin/player?id=${encodeURIComponent(id)}`);
  const [tab, setTab] = useState<'ledger' | 'pots' | 'log'>('ledger');
  const [dialog, setDialog] = useState<'coins' | 'ban' | 'unban' | 'phone' | 'password' | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;
  const { player, extra } = data;

  return (
    <>
      <Link href="/joueurs" className="btn btn-ghost -ml-3 mb-3">
        <Icon.Back size={18} />
        Joueurs
      </Link>

      <div className="card flex flex-wrap items-center gap-4 p-5">
        <Avatar name={player.username} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-medium">{player.username}</h1>
            {player.bannedAt ? <Badge tone="danger">Suspendu</Badge> : player.online ? <Badge tone="accent">En ligne</Badge> : <Badge>Hors ligne</Badge>}
          </div>
          <p className="mt-0.5 text-[13.5px] text-muted">
            Compte n° {player.id} · inscrit le {day(player.createdAt)}
          </p>
          {player.bannedAt && (
            <p className="mt-1.5 text-[13.5px] text-danger">
              Suspendu {ago(player.bannedAt)} : {player.banReason}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-tonal" onClick={() => setDialog('coins')}>
            <Icon.Wallet size={18} />
            Ajuster les pièces
          </button>
          <button type="button" className="btn btn-tonal" onClick={() => setDialog('password')}>
            <Icon.Lock size={18} />
            Nouveau mot de passe
          </button>
          {player.bannedAt ? (
            <button type="button" className="btn btn-primary" onClick={() => setDialog('unban')}>
              <Icon.Check size={18} />
              Réactiver
            </button>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => setDialog('ban')}>
              <Icon.Block size={18} />
              Suspendre
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Pièces Free" value={<Amount value={player.coins} currency="free" />} />
        <Fact label="Pièces Premium" value={<Amount value={player.premiumCoins} currency="premium" />} />
        <Fact label="Parties / victoires" value={`${fmt(player.games)} / ${fmt(player.wins)}`} detail={`${fmt(player.xp)} XP`} />
        <Fact
          label="Social"
          value={`${fmt(extra.friends)} ami${extra.friends > 1 ? 's' : ''}`}
          detail={`${fmt(extra.messages)} message${extra.messages > 1 ? 's' : ''} envoyé${extra.messages > 1 ? 's' : ''}${
            extra.reportsAgainst ? ` · ${extra.reportsAgainst} signalé${extra.reportsAgainst > 1 ? 's' : ''}` : ''
          }`}
        />
      </div>

      <div className="card mt-3 flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-9 place-items-center rounded-full bg-info/15 text-[14px] font-bold text-info">W</span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium tracking-wide text-muted uppercase">Numéro Wave</p>
          <p className="text-[15px] tabular-nums">{data.wavePhone ?? <span className="text-muted">Aucun (lié au premier dépôt ou retrait)</span>}</p>
        </div>
        {data.wavePhone && (
          <button type="button" className="btn btn-ghost" onClick={() => setDialog('phone')}>
            Délier le numéro
          </button>
        )}
      </div>

      <div className="card mt-3 flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-9 place-items-center rounded-full bg-warn/15 text-[13px] font-bold text-warn">18+</span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium tracking-wide text-muted uppercase">Attestation de majorité</p>
          <p className="text-[15px]">
            {data.adult ? (
              <>
                Acceptée le {when(data.adult.at)} <span className="text-muted">· IP {data.adult.ip ?? 'inconnue'}</span>
              </>
            ) : (
              <span className="text-muted">Pas encore acceptée : aucun dépôt ni mise Premium possible</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-6 mb-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: 'ledger', label: 'Historique des pièces' },
            { id: 'pots', label: `Cagnottes (${data.pots.length})` },
            { id: 'log', label: `Actions admin (${data.log.length})` },
          ]}
        />
      </div>

      <div className="card overflow-hidden">
        {tab === 'ledger' &&
          (data.ledger.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Opération</th>
                    <th>Monnaie</th>
                    <th className="text-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.map((line) => (
                    <tr key={line.id}>
                      <td className="whitespace-nowrap text-muted">{when(line.createdAt)}</td>
                      <td>{LEDGER_REASON[line.reason] ?? line.reason}</td>
                      <td className="text-muted">{CURRENCY_NAME[line.currency]}</td>
                      <td className="text-right">
                        {line.reason === 'forfeit' ? <span className="text-danger">perdue</span> : <Amount value={line.delta} currency={line.currency} signedValue />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={<Icon.Wallet size={28} />}>Aucun mouvement de mise, gain ou ajustement.</Empty>
          ))}
        {tab === 'pots' && (data.pots.length ? <PotsTable pots={data.pots} /> : <Empty icon={<Icon.Casino size={28} />}>Aucune partie avec mise.</Empty>)}
        {tab === 'log' &&
          (data.log.length ? (
            <ul className="divide-y divide-line/50">
              {data.log.map((line) => (
                <li key={line.id} className="px-4 py-3">
                  <p className="text-[14px]">
                    <span className="font-medium">{ACTION_LABEL[line.action] ?? line.action}</span>
                    {line.details?.delta !== undefined && (
                      <span className="ml-2">
                        <Amount value={Number(line.details.delta)} currency={line.details.currency as Currency} signedValue />
                      </span>
                    )}
                  </p>
                  {typeof line.details?.reason === 'string' && <p className="text-[13.5px] text-muted">« {line.details.reason} »</p>}
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {line.admin ?? 'admin supprimé'} · {when(line.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<Icon.History size={28} />}>Aucune action admin sur ce compte.</Empty>
          ))}
      </div>

      <CoinsDialog open={dialog === 'coins'} player={player} onClose={() => setDialog(null)} onDone={reload} />
      <BanDialog open={dialog === 'ban'} player={player} onClose={() => setDialog(null)} onDone={reload} />
      <UnbanDialog open={dialog === 'unban'} player={player} onClose={() => setDialog(null)} onDone={reload} />
      <WavePhoneDialog open={dialog === 'phone'} player={player} phone={data.wavePhone} onClose={() => setDialog(null)} onDone={reload} />
      <PasswordDialog open={dialog === 'password'} player={player} onClose={() => setDialog(null)} onDone={reload} />
    </>
  );
}

function PasswordDialog({ open, player, onClose, onDone }: { open: boolean; player: PlayerRow; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction(onDone, () => {
    setPassword('');
    setReason('');
    onClose();
  });
  return (
    <Dialog open={open} title={`Nouveau mot de passe pour ${player.username}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run('/admin/players/password', { userId: player.id, password, reason });
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-[14px] leading-relaxed text-muted">
          Le joueur est déconnecté de tous ses appareils et devra se reconnecter avec ce mot de passe. Vérifie d’abord que la demande vient bien du titulaire du compte.
        </p>
        <label>
          <span className="label">Nouveau mot de passe</span>
          <input
            className="field"
            type="text"
            autoComplete="off"
            required
            minLength={6}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        <label>
          <span className="label">Motif</span>
          <input className="field" required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : mot de passe oublié, vérifié par appel" />
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Icon.Lock size={18} />
            Changer
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function WavePhoneDialog({
  open,
  player,
  phone,
  onClose,
  onDone,
}: {
  open: boolean;
  player: PlayerRow;
  phone: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction(onDone, onClose);
  return (
    <Dialog open={open} title="Délier le numéro Wave ?" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run('/admin/payments/phone/reset', { userId: player.id, reason });
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-[14px] leading-relaxed text-muted">
          {player.username} pourra lier un autre numéro à son prochain dépôt ou retrait. Vérifie d’abord que la demande vient bien du titulaire de {phone}.
        </p>
        <label>
          <span className="label">Motif</span>
          <input className="field" required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="Ex. : changement de puce, vérifié par appel" />
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-danger" disabled={busy}>
            Délier
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function Fact({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[12.5px] font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-[19px] font-medium">{value}</p>
      {detail && <p className="mt-0.5 text-[13px] text-muted">{detail}</p>}
    </div>
  );
}

function useAction(onDone: () => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await adminApi(path, body);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, reset: () => setError(null) };
}

function CoinsDialog({ open, player, onClose, onDone }: { open: boolean; player: PlayerRow; onClose: () => void; onDone: () => void }) {
  const [currency, setCurrency] = useState<Currency>('free');
  const [mode, setMode] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction(onDone, () => {
    setAmount('');
    setReason('');
    onClose();
  });
  const value = Math.floor(Number(amount));
  const balance = currency === 'free' ? player.coins : player.premiumCoins;
  const after = balance + (mode === 'credit' ? value : -value) || balance;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run('/admin/coins', { userId: player.id, currency, delta: mode === 'credit' ? value : -value, reason });
  };

  return (
    <Dialog open={open} title="Ajuster les pièces" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Segmented
            value={currency}
            onChange={setCurrency}
            options={[
              { id: 'free', label: 'Free' },
              { id: 'premium', label: 'Premium' },
            ]}
          />
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { id: 'credit', label: 'Créditer' },
              { id: 'debit', label: 'Retirer' },
            ]}
          />
        </div>
        <label>
          <span className="label">Montant</span>
          <input className="field" type="number" inputMode="numeric" min={1} step={1} required value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </label>
        <label>
          <span className="label">Motif (visible par le joueur)</span>
          <input className="field" required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : compensation après un bug" />
        </label>
        <p className="text-[13.5px] text-muted">
          Solde {CURRENCY_NAME[currency]} : {fmt(balance)}
          {value > 0 && (
            <>
              {' '}
              → <span className={after < 0 ? 'text-danger' : 'text-text'}>{fmt(after)}</span>
            </>
          )}
        </p>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className={`btn ${mode === 'credit' ? 'btn-primary' : 'btn-danger'}`} disabled={busy || !(value > 0) || after < 0}>
            {mode === 'credit' ? <Icon.Add size={18} /> : <Icon.Remove size={18} />}
            {mode === 'credit' ? 'Créditer' : 'Retirer'} {value > 0 ? fmt(value) : ''}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function BanDialog({ open, player, onClose, onDone }: { open: boolean; player: PlayerRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction(onDone, onClose);
  return (
    <Dialog open={open} title={`Suspendre ${player.username} ?`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run('/admin/ban', { userId: player.id, reason });
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-[14px] leading-relaxed text-muted">
          Le joueur est déconnecté tout de suite de tous ses appareils et ne pourra plus se connecter. Ses parties en cours continuent sans lui.
        </p>
        <label>
          <span className="label">Motif</span>
          <input className="field" required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="Ex. : insultes répétées" />
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-danger" disabled={busy}>
            <Icon.Block size={18} />
            Suspendre
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function UnbanDialog({ open, player, onClose, onDone }: { open: boolean; player: PlayerRow; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useAction(onDone, onClose);
  return (
    <Dialog open={open} title={`Réactiver ${player.username} ?`} onClose={onClose}>
      <p className="text-[14px] leading-relaxed text-muted">Le joueur pourra se reconnecter avec son mot de passe.</p>
      {error && (
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run('/admin/unban', { userId: player.id })}>
          <Icon.Check size={18} />
          Réactiver
        </button>
      </div>
    </Dialog>
  );
}
