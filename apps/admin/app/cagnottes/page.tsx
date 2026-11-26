'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/Icons';
import { PotsTable, type Pot } from '@/components/PotsTable';
import { Empty, ErrorBox, Loading, PageHeader, Pager, Segmented } from '@/components/ui';
import { useAdminData } from '@/lib/api';
import { fmt } from '@/lib/format';

type Status = '' | 'open' | 'settled' | 'refunded' | 'forfeited';
type CurrencyFilter = '' | 'free' | 'premium';

export default function PotsPage() {
  const [status, setStatus] = useState<Status>('');
  const [currency, setCurrency] = useState<CurrencyFilter>('');
  const [page, setPage] = useState(0);
  const params = new URLSearchParams({ status, currency, page: String(page) });
  const { data, error, loading } = useAdminData<{ pots: Pot[]; total: number; pageSize: number }>(`/admin/pots?${params}`, 20_000);

  return (
    <>
      <PageHeader title="Cagnottes" subtitle={data ? `${fmt(data.total)} parties avec mise` : undefined} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
          options={[
            { id: '', label: 'Toutes' },
            { id: 'open', label: 'En cours' },
            { id: 'settled', label: 'Gagnées' },
            { id: 'refunded', label: 'Remboursées' },
            { id: 'forfeited', label: 'Abandonnées' },
          ]}
        />
        <Segmented
          value={currency}
          onChange={(v) => {
            setCurrency(v);
            setPage(0);
          }}
          options={[
            { id: '', label: 'Toutes monnaies' },
            { id: 'free', label: 'Free' },
            { id: 'premium', label: 'Premium' },
          ]}
        />
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="card overflow-hidden">
        {loading && !data ? <Loading /> : data?.pots.length ? <PotsTable pots={data.pots} /> : <Empty icon={<Icon.Wallet size={28} />}>Aucune cagnotte.</Empty>}
      </div>
      {data && <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
      <SuspiciousPairs />
    </>
  );
}

interface SuspiciousPair {
  players: { id: number; username: string | null; wins: number }[];
  games: number;
  volume: { free: number; premium: number };
}

/** Accounts that often meet at staked tables with the same one nearly always winning (30 days). */
function SuspiciousPairs() {
  const { data, error } = useAdminData<{ pairs: SuspiciousPair[] }>('/admin/pots/suspicious', 60_000);
  return (
    <section className="mt-8">
      <h2 className="mb-1 text-base font-semibold">Paires suspectes</h2>
      <p className="mb-3 text-sm text-muted">
        Au moins 5 parties avec mise l’un contre l’autre en 30 jours, gagnées à 80 % ou plus par le même joueur : possible transfert de pièces
        entre deux comptes d’une même personne.
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="card overflow-hidden">
        {!data ? (
          <Loading />
        ) : data.pairs.length === 0 ? (
          <Empty icon={<Icon.Wallet size={28} />}>Aucune paire suspecte.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Joueurs (victoires)</th>
                  <th className="text-right">Parties</th>
                  <th className="text-right">Mises Free</th>
                  <th className="text-right">Mises Premium</th>
                </tr>
              </thead>
              <tbody>
                {data.pairs.map((pair) => (
                  <tr key={pair.players.map((p) => p.id).join(':')}>
                    <td>
                      <div className="flex flex-wrap gap-x-3">
                        {pair.players.map((p) => (
                          <Link key={p.id} href={`/joueurs/${p.id}`} className="text-info hover:underline">
                            {p.username ?? 'compte supprimé'} ({p.wins})
                          </Link>
                        ))}
                      </div>
                    </td>
                    <td className="text-right">{fmt(pair.games)}</td>
                    <td className="text-right">{fmt(pair.volume.free)}</td>
                    <td className="text-right">{fmt(pair.volume.premium)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
