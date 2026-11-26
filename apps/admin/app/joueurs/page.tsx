'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icons';
import { Amount, Avatar, Badge, Empty, ErrorBox, Loading, PageHeader, Pager, Segmented } from '@/components/ui';
import { useAdminData } from '@/lib/api';
import { day, fmt } from '@/lib/format';
import type { PlayerRow } from '@/lib/types';


export default function PlayersPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'banned'>('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(input.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  const params = new URLSearchParams({ q: query, page: String(page), ...(filter === 'banned' ? { banned: '1' } : {}) });
  const { data, error, loading } = useAdminData<{ players: PlayerRow[]; total: number; pageSize: number }>(`/admin/players?${params}`);

  return (
    <>
      <PageHeader title="Joueurs" subtitle={data ? `${fmt(data.total)} comptes` : undefined} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-60 flex-1">
          <Icon.Search size={20} className="pointer-events-none absolute inset-y-0 left-3 my-auto text-muted" />
          <input className="field pl-10" placeholder="Rechercher un pseudo" value={input} onChange={(e) => setInput(e.target.value)} />
        </label>
        <Segmented
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(0);
          }}
          options={[
            { id: 'all', label: 'Tous' },
            { id: 'banned', label: 'Suspendus' },
          ]}
        />
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="card overflow-hidden">
        {loading && !data ? (
          <Loading />
        ) : data?.players.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Joueur</th>
                  <th>Inscrit le</th>
                  <th className="text-right">Parties</th>
                  <th className="text-right">Victoires</th>
                  <th className="text-right">Free</th>
                  <th className="text-right">Premium</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.players.map((p) => (
                  <tr key={p.id} className="cursor-pointer">
                    <td>
                      <Link href={`/joueurs/${p.id}`} className="flex items-center gap-3">
                        <span className="relative">
                          <Avatar name={p.username} size={34} />
                          {p.online && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface bg-accent" title="En ligne" />}
                        </span>
                        <span className="font-medium">{p.username}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap text-muted">{day(p.createdAt)}</td>
                    <td className="text-right tabular-nums">{fmt(p.games)}</td>
                    <td className="text-right tabular-nums">{fmt(p.wins)}</td>
                    <td className="text-right">
                      <Amount value={p.coins} currency="free" />
                    </td>
                    <td className="text-right">
                      <Amount value={p.premiumCoins} currency="premium" />
                    </td>
                    <td>{p.bannedAt ? <Badge tone="danger">Suspendu</Badge> : p.online ? <Badge tone="accent">En ligne</Badge> : <Badge>Hors ligne</Badge>}</td>
                    <td className="w-10 text-muted">
                      <Link href={`/joueurs/${p.id}`} aria-label={`Ouvrir ${p.username}`}>
                        <Icon.ChevronRight size={20} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={<Icon.People size={28} />}>{query ? `Aucun joueur ne correspond à « ${query} ».` : 'Aucun joueur.'}</Empty>
        )}
      </div>
      {data && <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
    </>
  );
}
