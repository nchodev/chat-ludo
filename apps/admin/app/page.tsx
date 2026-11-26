'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icons';
import { ErrorBox, Loading, PageHeader, StatCard } from '@/components/ui';
import { useAdminData } from '@/lib/api';
import { fmt } from '@/lib/format';

interface Stats {
  players: { total: number; today: number; week: number; banned: number };
  games: { playerGames: number; staked: number; open: number; settled: number; refunded: number; forfeited: number };
  volume: { free: number; premium: number };
  commissions: { free: number; premium: number };
  commissionsToday: { free: number; premium: number };
  messages: { total: number; today: number };
  openReports: number;
  live: { players: number; connections: number; searching: number; rooms: number; playing: number; stakedPlaying: number };
  commissionsByDay: { day: string; free: number; premium: number }[];
}

export default function DashboardPage() {
  const { data, error, loading, reload } = useAdminData<Stats>('/admin/stats', 15_000);

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle="Mis à jour toutes les 15 secondes"
        actions={
          <button type="button" className="btn btn-tonal" onClick={reload}>
            <Icon.Refresh size={18} />
            Actualiser
          </button>
        }
      />
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <div className="flex flex-col gap-6">
            <section>
              <h2 className="mb-3 text-[13px] font-medium tracking-wide text-muted uppercase">En ce moment</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={<Icon.People />}
                  label="Joueurs connectés"
                  value={fmt(data.live.players)}
                  detail={`${fmt(data.live.connections)} connexions ouvertes`}
                  tone="accent"
                />
                <StatCard icon={<Icon.Casino />} label="Parties en cours" value={fmt(data.live.playing)} detail={`${fmt(data.live.stakedPlaying)} avec mise · ${fmt(data.live.rooms)} salons`} tone="info" />
                <StatCard icon={<Icon.Search />} label="En recherche" value={fmt(data.live.searching)} detail="Partie rapide" tone="warn" />
                <Link href="/signalements" className="block">
                  <StatCard
                    icon={<Icon.Flag />}
                    label="Signalements"
                    value={fmt(data.openReports)}
                    detail={data.openReports ? 'À traiter' : 'Rien à traiter'}
                    tone={data.openReports ? 'danger' : 'accent'}
                  />
                </Link>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-[13px] font-medium tracking-wide text-muted uppercase">Commissions de la plateforme</h2>
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr_2fr]">
                <StatCard
                  icon={<Icon.Coin />}
                  label="Commissions Free"
                  value={fmt(data.commissions.free)}
                  detail={`+${fmt(data.commissionsToday.free)} sur 24 h · ${fmt(data.volume.free)} misés`}
                  tone="warn"
                />
                <StatCard
                  icon={<Icon.Gem />}
                  label="Commissions Premium"
                  value={fmt(data.commissions.premium)}
                  detail={`+${fmt(data.commissionsToday.premium)} sur 24 h · ${fmt(data.volume.premium)} misés`}
                  tone="info"
                />
                <CommissionChart days={data.commissionsByDay} />
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-[13px] font-medium tracking-wide text-muted uppercase">Depuis le lancement</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={<Icon.People />}
                  label="Joueurs inscrits"
                  value={fmt(data.players.total)}
                  detail={`+${fmt(data.players.today)} aujourd’hui · +${fmt(data.players.week)} sur 7 j${data.players.banned ? ` · ${fmt(data.players.banned)} suspendus` : ''}`}
                />
                <StatCard icon={<Icon.Trophy />} label="Parties jouées" value={fmt(data.games.playerGames)} detail="Par les joueurs inscrits (une par joueur)" tone="info" />
                <StatCard
                  icon={<Icon.Wallet />}
                  label="Parties avec mise"
                  value={fmt(data.games.staked)}
                  detail={`${fmt(data.games.settled)} gagnées · ${fmt(data.games.refunded)} remboursées · ${fmt(data.games.forfeited)} abandonnées${data.games.open ? ` · ${fmt(data.games.open)} en cours` : ''}`}
                  tone="warn"
                />
                <StatCard icon={<Icon.Chat />} label="Messages" value={fmt(data.messages.total)} detail={`+${fmt(data.messages.today)} sur 24 h`} />
              </div>
            </section>
          </div>
        )
      )}
    </>
  );
}

function CommissionChart({ days }: { days: Stats['commissionsByDay'] }) {
  const max = Math.max(1, ...days.flatMap((d) => [d.free, d.premium]));
  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-medium tracking-wide text-muted uppercase">14 derniers jours</p>
        <div className="flex gap-3 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-warn" /> Free
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-info" /> Premium
          </span>
        </div>
      </div>
      <div className="mt-3 flex h-28 flex-1 items-end gap-1.5">
        {days.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center gap-0.5" title={`${d.day} : ${fmt(d.free)} Free, ${fmt(d.premium)} Premium`}>
            <span className="w-full max-w-2.5 rounded-t bg-warn/80" style={{ height: `${(d.free / max) * 100}%`, minHeight: d.free ? 3 : 1 }} />
            <span className="w-full max-w-2.5 rounded-t bg-info/80" style={{ height: `${(d.premium / max) * 100}%`, minHeight: d.premium ? 3 : 1 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
        <span>{days[0]?.day.slice(5).split('-').reverse().join('/')}</span>
        <span>Aujourd’hui</span>
      </div>
    </div>
  );
}
