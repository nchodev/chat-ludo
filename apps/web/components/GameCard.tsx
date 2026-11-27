'use client';

import Link from 'next/link';
import { GAMES, useGameAvailability, type GameEntry } from '@/lib/games';
import { Icon } from './Icons';
import { useLang } from '@/lib/i18n';
import { LudoLogo } from './LudoLogo';
import { DraughtsLogo } from './draughts/DraughtsLogo';
import { AwaleLogo } from './awale/AwaleLogo';

function GameCover({ id }: { id: GameEntry['id'] }) {
  switch (id) {
    case 'ludo':
      return (
        <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-emerald-500/40 via-sky-600/25 to-fuchsia-600/30">
          <LudoLogo size={68} />
        </div>
      );
    case 'dames':
      return (
        <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-amber-700/45 via-orange-900/30 to-stone-800/40">
          <DraughtsLogo size={68} />
        </div>
      );
    case 'awale':
      return (
        <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-orange-700/45 via-amber-900/35 to-emerald-900/30">
          <AwaleLogo size={68} />
        </div>
      );
  }
}

/** Entry of the games catalog; a game switched off by the admins is shown greyed out. */
export function GameCard({ game, disabled = false }: { game: GameEntry; disabled?: boolean }) {
  const { t } = useLang();
  const body = (
    <>
      <div className={disabled ? 'grayscale' : ''}>
        <GameCover id={game.id} />
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-[16.5px] leading-tight font-semibold text-[#e9edef]">{game.name}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-[#8696a0]">
          <Icon.Groups size={14} />
          {game.players}
        </p>
        <p className="mt-1.5 line-clamp-2 flex-1 text-[13px] leading-snug text-[#aebac1]">{disabled ? t('Momentanément indisponible', 'Temporarily unavailable') : game.short}</p>
        {disabled ? (
          <span className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-full bg-[#2a3942] text-[13px] font-medium text-[#8696a0]">
            <Icon.Block size={16} />
            {t('Indisponible', 'Unavailable')}
          </span>
        ) : (
          <span className="mt-3 flex h-9 items-center justify-center gap-1 rounded-full bg-[#00a884] text-[14px] font-semibold text-[#0b141a]">
            <Icon.Play size={18} />
            {t('Jouer', 'Play')}
          </span>
        )}
      </div>
    </>
  );
  const className = 'flex flex-col overflow-hidden rounded-3xl bg-[#1f2c33]';
  if (disabled) {
    return (
      <div className={`${className} opacity-60`} aria-disabled>
        {body}
      </div>
    );
  }
  return (
    <Link href={game.href} className={`${className} transition active:scale-[0.97]`}>
      {body}
    </Link>
  );
}

/** Every game of the app in two columns, the ones switched off last. */
export function GamesCatalog() {
  const availability = useGameAvailability();
  const { t } = useLang();
  const open = GAMES.filter((g) => availability[g.id]);
  const closed = GAMES.filter((g) => !availability[g.id]);
  return (
    <section className="flex flex-col gap-3 pt-4">
      <h2 className="px-1 text-[13px] font-semibold tracking-wide text-[#00a884] uppercase">
        {open.length > 1
          ? t(`${open.length} jeux disponibles`, `${open.length} games available`)
          : open.length === 1
            ? t('1 jeu disponible', '1 game available')
            : t('Aucun jeu disponible pour le moment', 'No games available right now')}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {open.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
        {closed.map((game) => (
          <GameCard key={game.id} game={game} disabled />
        ))}
      </div>
    </section>
  );
}
