'use client';

import type { ComponentType, ReactNode } from 'react';
import { AWALE_CLOCK_MS, DRAUGHTS_CLOCK_MS, type DuelGame, type DuelStates, type Side } from '@ludo/engine';
import { AwaleDuelView, AwaleSideToken, awaleEnding } from '../awale/AwaleGameView';
import { AwaleLogo } from '../awale/AwaleLogo';
import { PieceDisc } from '../draughts/DraughtsBoard';
import { DraughtsDuelView, draughtsEnding } from '../draughts/DraughtsGameView';
import { DraughtsLogo } from '../draughts/DraughtsLogo';
import type { DuelViewProps } from './DuelFrame';
import { tr } from '@/lib/i18n';

/** What the shared online pages need to know about one two-player game (texts are getters: current language). */
export interface DuelUi<K extends DuelGame = DuelGame> {
  kind: K;
  name: string;
  /** Subtitle of the online game screen. */
  long: string;
  /** Root of the game's pages, e.g. `/dames`. */
  base: string;
  /** End of "Rejoins-moi …", for invitations. */
  inviteGame: string;
  /** Title of the screen asking a guest for a name. */
  challengeTitle: string;
  roomTitle: string;
  clockMs: number;
  /** Who starts, in the room lobby. */
  sidesText: string;
  logo: (size: number) => ReactNode;
  /** Two pieces of the game, facing each other, while searching an opponent. */
  searchArt: ReactNode;
  View: ComponentType<DuelViewProps<DuelStates[K]>>;
  ending: (state: DuelStates[K], names: Record<Side, string>) => string;
}

export const DUEL_UI: { [K in DuelGame]: DuelUi<K> } = {
  dames: {
    kind: 'dames',
    get name() {
      return tr('Dames', 'Draughts');
    },
    get long() {
      return tr('Dames internationales', 'International draughts');
    },
    base: '/dames',
    get inviteGame() {
      return tr('aux dames', 'draughts');
    },
    get challengeTitle() {
      return tr('On te défie aux dames !', 'You’re challenged to draughts!');
    },
    get roomTitle() {
      return tr('Salon de dames', 'Draughts room');
    },
    clockMs: DRAUGHTS_CLOCK_MS,
    get sidesText() {
      return tr('Les couleurs sont tirées au sort, puis échangées à chaque revanche.', 'Colours are drawn at random, then swapped at each rematch.');
    },
    logo: (size) => <DraughtsLogo size={size} />,
    searchArt: (
      <span className="relative flex items-center">
        <span className="size-20">
          <PieceDisc piece="W" />
        </span>
        <span className="-ml-6 size-20 animate-pulse">
          <PieceDisc piece="B" />
        </span>
      </span>
    ),
    View: DraughtsDuelView,
    ending: draughtsEnding,
  },
  awale: {
    kind: 'awale',
    name: 'Awalé',
    get long() {
      return tr('Awalé · 2 × 6 trous', 'Awalé · 2 × 6 pits');
    },
    base: '/awale',
    get inviteGame() {
      return tr('à l’awalé', 'Awalé');
    },
    get challengeTitle() {
      return tr('On te défie à l’awalé !', 'You’re challenged to Awalé!');
    },
    get roomTitle() {
      return tr('Salon d’awalé', 'Awalé room');
    },
    clockMs: AWALE_CLOCK_MS,
    get sidesText() {
      return tr('Celui qui commence est tiré au sort, puis on alterne à chaque revanche.', 'Who starts is drawn at random, then it alternates at each rematch.');
    },
    logo: (size) => <AwaleLogo size={size} />,
    searchArt: (
      <span className="relative flex items-center">
        <span className="size-20">
          <AwaleSideToken side="white" />
        </span>
        <span className="-ml-6 size-20 animate-pulse">
          <AwaleSideToken side="black" />
        </span>
      </span>
    ),
    View: AwaleDuelView,
    ending: awaleEnding,
  },
};
