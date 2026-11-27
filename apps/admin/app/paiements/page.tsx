'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icons';
import { PaymentSettings } from '@/components/PaymentSettings';
import { Badge, Dialog, Empty, ErrorBox, Loading, PageHeader, Pager, Segmented } from '@/components/ui';
import { adminApi, useAdminData } from '@/lib/api';
import { ago, fmt, when } from '@/lib/format';

interface Payment {
  reference: string;
  userId: number;
  username: string;
  kind: 'deposit' | 'withdrawal';
  amount: number;
  phone: string | null;
  status: 'pending' | 'succeeded' | 'failed';
  providerRef: string | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  wavePhone: string | null;
  premiumCoins: number;
  totalDeposited: number;
  totalWithdrawn: number;
  admin: string | null;
}

type View = 'pending' | 'pendingDeposits' | 'paid' | 'refused' | 'deposits' | 'settings';
type Action = { kind: 'pay' | 'refuse' | 'confirmDeposit' | 'failDeposit'; payment: Payment };

const QUERY: Record<Exclude<View, 'settings'>, string> = {
  pending: 'kind=withdrawal&status=pending',
  pendingDeposits: 'kind=deposit&status=pending',
  paid: 'kind=withdrawal&status=succeeded',
  refused: 'kind=withdrawal&status=failed',
  deposits: 'kind=deposit',
};

const DEPOSIT_STATUS = {
  pending: { label: 'En attente', tone: 'warn' },
  succeeded: { label: 'Crédité', tone: 'accent' },
  failed: { label: 'Non abouti', tone: 'muted' },
} as const;

const fcfa = (n: number) => `${fmt(n)} F`;

export default function PaymentsPage() {
  const [view, setView] = useState<View>('pending');
  const [page, setPage] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { data, error, loading, reload } = useAdminData<{ payments: Payment[]; total: number; pageSize: number }>(
    view === 'settings' ? null : `/admin/payments?${QUERY[view]}&page=${page}`,
    view === 'pending' || view === 'pendingDeposits' ? 20_000 : undefined,
  );

  return (
    <>
      <PageHeader
        title="Paiements Wave"
        subtitle="Les retraits s’envoient à la main depuis le compte Wave Business, puis se confirment ici. Les dépôts restés en attente se vérifient ou se règlent ici."
        actions={
          view !== 'settings' && (
            <button type="button" className="btn btn-tonal" onClick={() => void reload()}>
              <Icon.Refresh size={18} />
              Actualiser
            </button>
          )
        }
      />
      <div className="mb-4">
        <Segmented
          value={view}
          onChange={(v) => {
            setView(v);
            setPage(0);
          }}
          options={[
            { id: 'pending', label: 'Retraits à traiter' },
            { id: 'pendingDeposits', label: 'Dépôts en attente' },
            { id: 'paid', label: 'Payés' },
            { id: 'refused', label: 'Refusés' },
            { id: 'deposits', label: 'Dépôts' },
            { id: 'settings', label: 'Réglages' },
          ]}
        />
      </div>
      {notice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-accent/10 px-4 py-3 text-[14px]">
          <span>{notice}</span>
          <button type="button" className="btn btn-ghost" onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}
      {view === 'settings' ? (
        <PaymentSettings />
      ) : (
        <PaymentsTable
          view={view}
          page={page}
          setPage={setPage}
          data={data}
          error={error}
          loading={loading}
          onAction={setAction}
          onChecked={(message) => {
            setNotice(message);
            void reload();
          }}
        />
      )}

      {action?.kind === 'pay' && <PayDialog payment={action.payment} onClose={() => setAction(null)} onDone={reload} />}
      {action?.kind === 'refuse' && <RefuseDialog payment={action.payment} onClose={() => setAction(null)} onDone={reload} />}
      {action?.kind === 'confirmDeposit' && <ConfirmDepositDialog payment={action.payment} onClose={() => setAction(null)} onDone={reload} />}
      {action?.kind === 'failDeposit' && <FailDepositDialog payment={action.payment} onClose={() => setAction(null)} onDone={reload} />}
    </>
  );
}

function PaymentsTable({
  view,
  page,
  setPage,
  data,
  error,
  loading,
  onAction,
  onChecked,
}: {
  view: Exclude<View, 'settings'>;
  page: number;
  setPage: (page: number) => void;
  data: { payments: Payment[]; total: number; pageSize: number } | null;
  error: string | null;
  loading: boolean;
  onAction: (action: Action) => void;
  onChecked: (message: string) => void;
}) {
  const depositView = view === 'deposits' || view === 'pendingDeposits';
  const [checking, setChecking] = useState<string | null>(null);
  const check = async (p: Payment) => {
    setChecking(p.reference);
    try {
      const { status } = await adminApi<{ status: Payment['status'] }>('/admin/payments/deposit/check', { reference: p.reference });
      onChecked(
        status === 'succeeded'
          ? `Wave confirme le paiement : ${fcfa(p.amount)} crédités à ${p.username}.`
          : status === 'failed'
            ? `Wave indique que le dépôt de ${p.username} n’a pas abouti : il est clos.`
            : `Wave n’a pas encore reçu le paiement de ${p.username} : le dépôt reste en attente.`,
      );
    } catch (err) {
      onChecked(err instanceof Error ? err.message : 'Vérification impossible.');
    } finally {
      setChecking(null);
    }
  };
  return (
    <>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="card overflow-hidden">
        {loading && !data ? (
          <Loading />
        ) : data?.payments.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Joueur</th>
                  <th>Numéro Wave</th>
                  <th className="text-right">Montant</th>
                  <th>{view === 'pending' ? 'Historique du joueur' : depositView ? 'État' : 'Traitement'}</th>
                  {(view === 'pending' || depositView) && <th />}
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.reference}>
                    <td className="whitespace-nowrap text-muted">
                      {when(p.createdAt)}
                      {(view === 'pending' || p.status === 'pending') && <span className="block text-[12px]">{ago(p.createdAt)}</span>}
                    </td>
                    <td>
                      <Link href={`/joueurs/${p.userId}`} className="text-info hover:underline">
                        {p.username}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap tabular-nums">
                      {p.phone}
                      {p.phone !== p.wavePhone && p.kind === 'withdrawal' && p.status === 'pending' && (
                        <span className="ml-1.5">
                          <Badge tone="danger">numéro changé depuis</Badge>
                        </span>
                      )}
                    </td>
                    <td className="text-right font-medium whitespace-nowrap tabular-nums">{fcfa(p.amount)}</td>
                    <td className="text-[13px]">
                      {view === 'pending' ? (
                        <span className="text-muted">
                          Dépôts {fcfa(p.totalDeposited)} · retraits payés {fcfa(p.totalWithdrawn)} · solde {fmt(p.premiumCoins)}
                          {p.totalDeposited === 0 && (
                            <span className="ml-1.5">
                              <Badge tone="warn">aucun dépôt</Badge>
                            </span>
                          )}
                        </span>
                      ) : depositView ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={DEPOSIT_STATUS[p.status].tone}>{DEPOSIT_STATUS[p.status].label}</Badge>
                          {p.note && <span className="text-muted">{p.note}</span>}
                          {p.status === 'succeeded' && p.providerRef && <span className="text-muted tabular-nums">{p.providerRef}</span>}
                          {p.admin && p.status !== 'pending' && <span className="text-[12px] text-muted">· par {p.admin}</span>}
                        </span>
                      ) : (
                        <span className="text-muted">
                          {view === 'paid' ? <>Transaction {p.providerRef}</> : <>« {p.note} »</>}
                          <span className="block text-[12px]">
                            {p.admin ?? 'admin supprimé'} · {when(p.updatedAt)}
                          </span>
                        </span>
                      )}
                    </td>
                    {depositView && (
                      <td className="whitespace-nowrap text-right">
                        {p.status === 'pending' && (
                          <>
                            <button type="button" className="btn btn-tonal" disabled={checking === p.reference} onClick={() => void check(p)}>
                              <Icon.Refresh size={18} />
                              {checking === p.reference ? 'Vérification…' : 'Vérifier sur Wave'}
                            </button>{' '}
                            <button type="button" className="btn btn-primary" onClick={() => onAction({ kind: 'confirmDeposit', payment: p })}>
                              <Icon.Check size={18} />
                              Crédité
                            </button>{' '}
                            <button type="button" className="btn btn-ghost" onClick={() => onAction({ kind: 'failDeposit', payment: p })}>
                              Non abouti
                            </button>
                          </>
                        )}
                      </td>
                    )}
                    {view === 'pending' && (
                      <td className="whitespace-nowrap text-right">
                        <button type="button" className="btn btn-primary" onClick={() => onAction({ kind: 'pay', payment: p })}>
                          <Icon.Check size={18} />
                          Payé
                        </button>{' '}
                        <button type="button" className="btn btn-ghost" onClick={() => onAction({ kind: 'refuse', payment: p })}>
                          Refuser
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={<Icon.Wallet size={28} />}>
            {view === 'pending'
              ? 'Aucun retrait à traiter.'
              : view === 'pendingDeposits'
                ? 'Aucun dépôt en attente.'
                : view === 'deposits'
                  ? 'Aucun dépôt.'
                  : 'Aucun retrait.'}
          </Empty>
        )}
      </div>
      {data && data.total > data.pageSize && <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
    </>
  );
}

function useSubmit(onDone: () => void, onClose: () => void) {
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
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function PayDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const [transactionId, setTransactionId] = useState('');
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useSubmit(onDone, onClose);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run('/admin/payments/pay', { reference: payment.reference, transactionId });
  };

  return (
    <Dialog open title="Confirmer le paiement" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[14px] leading-relaxed text-muted">
          <li>
            Depuis le compte Wave Business, envoie <strong className="text-text">{fcfa(payment.amount)}</strong> à {payment.username}.
          </li>
          <li>Copie l’identifiant de la transaction affiché par Wave et colle-le ci-dessous.</li>
        </ol>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-bg/60 px-4 py-3">
          <span>
            <span className="block text-[12px] text-muted">Numéro Wave</span>
            <span className="text-[19px] font-medium tabular-nums">{payment.phone}</span>
          </span>
          <button
            type="button"
            className="btn btn-tonal"
            onClick={() => {
              void navigator.clipboard?.writeText(payment.phone ?? '');
              setCopied(true);
            }}
          >
            {copied ? <Icon.Check size={18} /> : null}
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
        <label>
          <span className="label">Identifiant de la transaction Wave</span>
          <input
            className="field"
            required
            maxLength={64}
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value.trim())}
            autoFocus
            placeholder="Ex. : T_ABCD1234EFGH"
          />
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || transactionId.length < 4}>
            <Icon.Check size={18} />
            {fcfa(payment.amount)} envoyés
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RefuseDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useSubmit(onDone, onClose);
  return (
    <Dialog open title={`Refuser le retrait de ${payment.username} ?`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run('/admin/payments/refuse', { reference: payment.reference, reason });
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-[14px] leading-relaxed text-muted">
          Les {fmt(payment.amount)} pièces Premium sont rendues au joueur tout de suite. N’utilise ce bouton que si l’argent n’a pas été envoyé.
        </p>
        <label>
          <span className="label">Motif (visible par le joueur)</span>
          <input
            className="field"
            required
            minLength={3}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
            placeholder="Ex. : numéro Wave introuvable"
          />
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-danger" disabled={busy}>
            Refuser et rembourser
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ConfirmDepositDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const [transactionId, setTransactionId] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useSubmit(onDone, onClose);
  return (
    <Dialog open title={`Créditer le dépôt de ${payment.username} ?`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run('/admin/payments/deposit/confirm', { reference: payment.reference, transactionId, reason });
        }}
        className="flex flex-col gap-4"
      >
        <div className="rounded-2xl bg-warn/10 px-4 py-3 text-[14px] leading-relaxed">
          <strong>{fmt(payment.amount)} pièces Premium</strong> seront ajoutées au compte du joueur tout de suite, et un éventuel bonus de
          parrainage sera versé. Ne le fais qu’après avoir vu, dans le compte Wave Business, un paiement reçu de{' '}
          <strong className="tabular-nums">{payment.phone}</strong> d’un montant de <strong>{fcfa(payment.amount)}</strong>.
        </div>
        <p className="text-[13px] text-muted">
          Astuce : essaie d’abord « Vérifier sur Wave », qui règle le dépôt automatiquement si Wave a bien reçu l’argent.
        </p>
        <label>
          <span className="label">Identifiant de la transaction Wave</span>
          <input
            className="field"
            required
            maxLength={64}
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value.trim())}
            autoFocus
            placeholder="Ex. : T_ABCD1234EFGH"
          />
        </label>
        <label>
          <span className="label">Motif</span>
          <input
            className="field"
            required
            minLength={3}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex. : paiement reçu, notification Wave perdue"
          />
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || transactionId.length < 4 || reason.trim().length < 3}>
            <Icon.Check size={18} />
            Créditer {fcfa(payment.amount)}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function FailDepositDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useSubmit(onDone, onClose);
  return (
    <Dialog open title={`Marquer le dépôt de ${payment.username} comme non abouti ?`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run('/admin/payments/deposit/fail', { reference: payment.reference, reason });
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-[14px] leading-relaxed text-muted">
          Le dépôt de {fcfa(payment.amount)} est clos sans rien créditer. À utiliser seulement si le joueur n’a pas payé. S’il paie quand même
          plus tard, il faudra le créditer à la main.
        </p>
        <label>
          <span className="label">Motif</span>
          <input
            className="field"
            required
            minLength={3}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
            placeholder="Ex. : paiement abandonné par le joueur"
          />
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-danger" disabled={busy}>
            Marquer non abouti
          </button>
        </div>
      </form>
    </Dialog>
  );
}
