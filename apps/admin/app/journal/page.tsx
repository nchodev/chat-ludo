'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icons';
import { Amount, Empty, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { useAdminData } from '@/lib/api';
import { ACTION_LABEL, fmt, when, type Currency } from '@/lib/format';

interface LogLine {
  id: number;
  admin: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  createdAt: number;
}

function Target({ line }: { line: LogLine }) {
  const d = line.details ?? {};
  if (line.target?.startsWith('user:')) {
    const name = (d.username ?? d.sender) as string | undefined;
    return (
      <Link href={`/joueurs/${line.target.slice(5)}`} className="text-info hover:underline">
        {name ?? `joueur ${line.target.slice(5)}`}
      </Link>
    );
  }
  if (line.target?.startsWith('room:')) return <span className="font-mono">{line.target.slice(5)}</span>;
  if (line.target?.startsWith('admin:')) return <span>{(d.email as string) ?? 'admin'}</span>;
  return <span className="text-muted">—</span>;
}

function Details({ line }: { line: LogLine }) {
  const d = line.details ?? {};
  if (d.delta !== undefined) {
    return (
      <span>
        <Amount value={Number(d.delta)} currency={d.currency as Currency} signedValue /> <span className="text-muted">« {String(d.reason)} »</span>
      </span>
    );
  }
  if (line.action === 'settings.stakes') {
    const [before, after] = (d.winnerShare as [number, number]) ?? [];
    return (
      <span className="text-muted">
        Gagnant {Math.round(before * 100)} % → {Math.round(after * 100)} %, tables : {((d.tables as string[][])?.[1] ?? []).join(', ')}
        {(d.premiumEnabled as [boolean, boolean] | undefined)?.[0] !== (d.premiumEnabled as [boolean, boolean] | undefined)?.[1] &&
          `, Premium ${(d.premiumEnabled as [boolean, boolean])[1] ? 'activé' : 'désactivé'}`}
        {(d.premiumWalletCap as [number, number] | undefined)?.[0] !== (d.premiumWalletCap as [number, number] | undefined)?.[1] &&
          `, plafond Premium ${fmt((d.premiumWalletCap as [number, number])[0])} → ${fmt((d.premiumWalletCap as [number, number])[1])}`}
      </span>
    );
  }
  if (line.action === 'settings.payments') {
    const s = d.after as { depositsOpen: boolean; withdrawalsOpen: boolean; deposit: { min: number; max: number }; withdrawal: { min: number; perDay: number } };
    return (
      <span className="text-muted">
        {String(d.provider)} : dépôts {s.depositsOpen ? `${fmt(s.deposit.min)} à ${fmt(s.deposit.max)} F` : 'fermés'}, retraits{' '}
        {s.withdrawalsOpen ? `dès ${fmt(s.withdrawal.min)} F, ${fmt(s.withdrawal.perDay)} F / 24 h` : 'fermés'}
      </span>
    );
  }
  if (typeof d.game === 'string') return <span className="text-muted">{d.game}</span>;
  if (typeof d.reason === 'string') return <span className="text-muted">« {d.reason} »</span>;
  if (typeof d.body === 'string') return <span className="text-muted">« {d.body} »</span>;
  return null;
}

export default function LogPage() {
  const { data, error, loading } = useAdminData<{ log: LogLine[] }>('/admin/log', 30_000);
  return (
    <>
      <PageHeader title="Journal" subtitle="Les 200 dernières actions des administrateurs" />
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="card overflow-hidden">
        {loading && !data ? (
          <Loading />
        ) : data?.log.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Cible</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {data.log.map((line) => (
                  <tr key={line.id}>
                    <td className="whitespace-nowrap text-muted">{when(line.createdAt)}</td>
                    <td className="max-w-48 truncate">{line.admin ?? <span className="text-muted">supprimé</span>}</td>
                    <td className="whitespace-nowrap">{ACTION_LABEL[line.action] ?? line.action}</td>
                    <td>
                      <Target line={line} />
                    </td>
                    <td>
                      <Details line={line} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={<Icon.History size={28} />}>Aucune action pour le moment.</Empty>
        )}
      </div>
    </>
  );
}
