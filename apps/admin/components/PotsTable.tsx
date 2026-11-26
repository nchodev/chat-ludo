'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Amount, Badge } from './ui';
import { adminApi } from '@/lib/api';
import { when } from '@/lib/format';

export interface Pot {
  id: string;
  tableId: string;
  currency: 'free' | 'premium';
  stake: number;
  players: { id: number; username: string | null }[];
  status: 'open' | 'settled' | 'refunded';
  winner: string | null;
  forfeited: boolean;
  fee: number;
  createdAt: number;
  closedAt: number | null;
}

export function PotStatus({ pot }: { pot: Pot }) {
  if (pot.status === 'open') return <Badge tone="info">En cours</Badge>;
  if (pot.status === 'refunded') return <Badge tone="warn">Remboursée</Badge>;
  if (pot.forfeited) return <Badge tone="danger">Abandonnée</Badge>;
  return <Badge tone="accent">Gagnée</Badge>;
}

/** Downloads the archived game(s) of a pot: players, every move and die, dice seed. */
function ArchiveButton({ potId }: { potId: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'none' | 'error'>('idle');
  const download = async () => {
    setState('busy');
    try {
      const { games } = await adminApi<{ games: unknown[] }>(`/admin/pots/archive?id=${encodeURIComponent(potId)}`);
      if (!games.length) return setState('none');
      const url = URL.createObjectURL(new Blob([JSON.stringify(games, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `partie-${potId}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setState('idle');
    } catch {
      setState('error');
    }
  };
  if (state === 'none') return <span className="text-muted">Aucune</span>;
  return (
    <button type="button" onClick={download} disabled={state === 'busy'} className="text-info hover:underline disabled:opacity-50">
      {state === 'error' ? 'Réessayer' : 'Télécharger'}
    </button>
  );
}

export function PotsTable({ pots }: { pots: Pot[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Mise</th>
            <th>Joueurs</th>
            <th className="text-right">Cagnotte</th>
            <th>Gagnant</th>
            <th className="text-right">Commission</th>
            <th>Statut</th>
            <th>Archive</th>
          </tr>
        </thead>
        <tbody>
          {pots.map((pot) => (
            <tr key={pot.id}>
              <td className="whitespace-nowrap text-muted">{when(pot.createdAt)}</td>
              <td>
                <Amount value={pot.stake} currency={pot.currency} />
              </td>
              <td>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {pot.players.map((p) =>
                    p.username ? (
                      <Link key={p.id} href={`/joueurs/${p.id}`} className="text-info hover:underline">
                        {p.username}
                      </Link>
                    ) : (
                      <span key={p.id} className="text-muted">
                        compte supprimé
                      </span>
                    ),
                  )}
                </div>
              </td>
              <td className="text-right">
                <Amount value={pot.stake * pot.players.length} currency={pot.currency} />
              </td>
              <td>{pot.winner ?? <span className="text-muted">—</span>}</td>
              <td className="text-right">{pot.fee ? <Amount value={pot.fee} currency={pot.currency} /> : <span className="text-muted">—</span>}</td>
              <td>
                <PotStatus pot={pot} />
              </td>
              <td>{pot.status !== 'open' && <ArchiveButton potId={pot.id} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
