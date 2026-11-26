import type { GameId } from '@ludo/engine';
import { AwaleLogo } from './awale/AwaleLogo';
import { DraughtsLogo } from './draughts/DraughtsLogo';
import { LudoLogo } from './LudoLogo';

export function GameLogo({ game, size }: { game: GameId; size: number }) {
  switch (game) {
    case 'ludo':
      return <LudoLogo size={size} float={false} />;
    case 'dames':
      return <DraughtsLogo size={size} />;
    case 'awale':
      return <AwaleLogo size={size} />;
  }
}
