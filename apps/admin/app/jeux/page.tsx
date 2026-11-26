'use client';

import { GAME_IDS, GAME_NAMES, type GameAvailability, type GameId } from '@ludo/engine';
import { useState } from 'react';
import { Icon } from '@/components/Icons';
import { Badge, Dialog, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { adminApi, useAdminData } from '@/lib/api';

interface GamesData {
  games: GameAvailability;
  live: Record<GameId, { playing: number; searching: number }>;
}

const DESCRIPTION: Record<GameId, string> = {
  ludo: 'Partie rapide, salons privés, parties sur un écran et contre l’ordinateur.',
  dames: 'Dames internationales : partie rapide, salons privés, sur un écran et contre l’ordinateur.',
  awale: 'Awalé (règles abapa) : partie rapide, salons privés, sur un écran et contre l’ordinateur.',
};

const ACCENT: Record<GameId, string> = {
  ludo: 'from-emerald-500/30 via-sky-600/20 to-fuchsia-600/20',
  dames: 'from-amber-700/40 via-orange-900/25 to-stone-800/30',
  awale: 'from-yellow-700/40 via-amber-900/25 to-emerald-900/30',
};

export default function GamesPage() {
  const { data, error, loading, reload } = useAdminData<GamesData>('/admin/games', 10_000);
  const [pending, setPending] = useState<{ game: GameId; enabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;

  const apply = async () => {
    if (!pending) return;
    setBusy(true);
    setSaveError(null);
    try {
      await adminApi('/admin/games', pending);
      setPending(null);
      await reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Changement impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Jeux" subtitle="Activer ou désactiver un jeu pour tous les joueurs" />
      <div className="grid gap-4 lg:grid-cols-2">
        {GAME_IDS.map((game) => {
          const enabled = data.games[game];
          const live = data.live[game];
          return (
            <section key={game} className="card overflow-hidden">
              <div className={`flex items-center justify-between gap-3 bg-gradient-to-br p-5 ${ACCENT[game]}`}>
                <h2 className="text-[22px] font-medium">{GAME_NAMES[game]}</h2>
                <Badge tone={enabled ? 'accent' : 'danger'}>{enabled ? 'Activé' : 'Désactivé'}</Badge>
              </div>
              <div className="flex flex-col gap-4 p-5">
                <p className="text-[14px] text-muted">{DESCRIPTION[game]}</p>
                <div className="flex gap-6 text-[14px]">
                  <span>
                    <span className="text-[20px] font-medium">{live.playing}</span> <span className="text-muted">partie{live.playing > 1 ? 's' : ''} en cours</span>
                  </span>
                  <span>
                    <span className="text-[20px] font-medium">{live.searching}</span> <span className="text-muted">en recherche</span>
                  </span>
                </div>
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-white/[0.04] px-4 py-3">
                  <span>
                    <span className="block text-[15px] font-medium">Proposer ce jeu</span>
                    <span className="block text-[13px] text-muted">{enabled ? 'Visible et jouable dans l’app' : 'Masqué : aucune nouvelle partie possible'}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${enabled ? 'Désactiver' : 'Activer'} ${GAME_NAMES[game]}`}
                    onClick={() => setPending({ game, enabled: !enabled })}
                    className={`relative h-8 w-14 shrink-0 rounded-full transition ${enabled ? 'bg-accent' : 'bg-white/15'}`}
                  >
                    <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-7' : 'left-1'}`} />
                  </button>
                </label>
              </div>
            </section>
          );
        })}
      </div>

      <Dialog
        open={!!pending}
        title={pending ? `${pending.enabled ? 'Activer' : 'Désactiver'} ${GAME_NAMES[pending.game]} ?` : ''}
        onClose={() => setPending(null)}
      >
        {pending && (
          <div className="flex flex-col gap-3 text-[14px]">
            {pending.enabled ? (
              <p className="text-muted">Le jeu réapparaît dans l’app et les joueurs peuvent à nouveau lancer des parties.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-muted">
                <li className="flex gap-2">
                  <Icon.Block size={18} className="mt-0.5 shrink-0" />
                  Le jeu est grisé dans l’app : plus aucune nouvelle partie, en ligne comme sur un écran.
                </li>
                <li className="flex gap-2">
                  <Icon.Search size={18} className="mt-0.5 shrink-0" />
                  Les {data.live[pending.game].searching} recherche(s) en cours sont annulées, sans aucune mise prise.
                </li>
                <li className="flex gap-2">
                  <Icon.Check size={18} className="mt-0.5 shrink-0" />
                  Les {data.live[pending.game].playing} partie(s) en cours se terminent normalement, cagnottes comprises.
                </li>
              </ul>
            )}
            {saveError && <ErrorBox>{saveError}</ErrorBox>}
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
                Annuler
              </button>
              <button type="button" className={`btn ${pending.enabled ? 'btn-primary' : 'btn-danger'}`} disabled={busy} onClick={apply}>
                {pending.enabled ? 'Activer' : 'Désactiver'}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
