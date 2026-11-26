'use client';

import Link from 'next/link';
import { useState } from 'react';
import { GAME_NAMES, type GameId } from '@ludo/engine';
import { Icon } from '@/components/Icons';
import { Amount, Badge, Dialog, Empty, ErrorBox, Loading, PageHeader, Segmented } from '@/components/ui';
import { adminApi, useAdminData } from '@/lib/api';
import { SEAT_HEX, ago } from '@/lib/format';

interface LiveRoom {
  code: string;
  game: GameId;
  kind: 'private' | 'quick' | 'shared';
  status: 'lobby' | 'playing' | 'over';
  players: { name: string; color: string; bot: boolean; userId: number | null; connected: boolean }[];
  spectators: number;
  stake: { currency: 'free' | 'premium'; stake: number; pot: number; potId: string } | null;
  lastActivity: number;
}

const KIND_LABEL = { private: 'Salon privé', quick: 'Partie rapide', shared: 'Un seul écran' };
const STATUS = {
  lobby: { label: 'En attente', tone: 'muted' },
  playing: { label: 'En jeu', tone: 'accent' },
  over: { label: 'Terminée', tone: 'info' },
} as const;

export default function RoomsPage() {
  const { data, error, loading, reload } = useAdminData<{ rooms: LiveRoom[] }>('/admin/rooms', 5000);
  const [filter, setFilter] = useState<'all' | 'playing' | 'staked'>('all');
  const [closing, setClosing] = useState<LiveRoom | null>(null);

  const rooms = (data?.rooms ?? []).filter((r) => (filter === 'playing' ? r.status === 'playing' : filter === 'staked' ? !!r.stake : true));

  return (
    <>
      <PageHeader title="Salons en direct" subtitle="Mis à jour toutes les 5 secondes" />
      <div className="mb-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: `Tous (${data?.rooms.length ?? 0})` },
            { id: 'playing', label: 'En jeu' },
            { id: 'staked', label: 'Avec mise' },
          ]}
        />
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading && !data ? (
        <Loading />
      ) : rooms.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {rooms.map((room) => (
            <article key={room.code} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-[17px] font-medium tracking-wider">{room.code}</p>
                  <p className="text-[12.5px] text-muted">
                    {GAME_NAMES[room.game]} · {KIND_LABEL[room.kind]} · activité {ago(room.lastActivity)}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {room.stake && (
                    <Badge tone="warn">
                      Cagnotte <Amount value={room.stake.pot} currency={room.stake.currency} />
                    </Badge>
                  )}
                  <Badge tone={STATUS[room.status].tone}>{STATUS[room.status].label}</Badge>
                </div>
              </div>
              <ul className="flex flex-col gap-1.5">
                {room.players.map((p, i) => (
                  <li key={`${p.color}-${i}`} className="flex items-center gap-2.5 text-[14px]">
                    <span className="size-3 shrink-0 rounded-full ring-1 ring-line" style={{ background: SEAT_HEX[p.color] }} />
                    {p.bot && <Icon.Robot size={16} className="text-muted" />}
                    {p.userId ? (
                      <Link href={`/joueurs/${p.userId}`} className="truncate text-info hover:underline">
                        {p.name}
                      </Link>
                    ) : (
                      <span className="truncate">{p.name}</span>
                    )}
                    {!p.bot && !p.connected && <Badge tone="warn">Déconnecté</Badge>}
                  </li>
                ))}
                {room.players.length === 0 && <li className="text-[13.5px] text-muted">Aucun joueur assis</li>}
              </ul>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line/50 pt-3">
                <span className="text-[12.5px] text-muted">{room.spectators ? `${room.spectators} spectateur${room.spectators > 1 ? 's' : ''}` : ''}</span>
                <button type="button" className="btn btn-danger h-9" onClick={() => setClosing(room)}>
                  <Icon.Close size={18} />
                  Fermer le salon
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty icon={<Icon.Casino size={28} />}>Aucun salon pour le moment.</Empty>
        </div>
      )}
      <CloseDialog room={closing} onClose={() => setClosing(null)} onDone={reload} />
    </>
  );
}

function CloseDialog({ room, onClose, onDone }: { room: LiveRoom | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setReason('');
    setError(null);
    onClose();
  };
  return (
    <Dialog open={!!room} title={`Fermer le salon ${room?.code ?? ''} ?`} onClose={close}>
      {room && (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await adminApi('/admin/rooms/close', { code: room.code, reason });
              onDone();
              close();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Fermeture impossible.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-[14px] leading-relaxed text-muted">
            Les joueurs sont sortis de la partie avec le motif ci-dessous.
            {room.stake && (
              <>
                {' '}
                La cagnotte de <Amount value={room.stake.pot} currency={room.stake.currency} /> est remboursée : chacun récupère sa mise.
              </>
            )}
          </p>
          <label>
            <span className="label">Motif (affiché aux joueurs)</span>
            <input className="field" required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="Ex. : partie bloquée" />
          </label>
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Annuler
            </button>
            <button type="submit" className="btn btn-danger" disabled={busy}>
              Fermer{room.stake ? ' et rembourser' : ''}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
