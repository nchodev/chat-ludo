import {
  DEFAULT_RULES,
  FINISHED,
  type BotLevel,
  type Color,
  type GameState,
  type RewardLine,
  type Rules,
} from '@ludo/engine';

export interface RulesPreset {
  id: string;
  label: string;
  icon: string;
  rules: Rules;
}

export const RULES_PRESETS: RulesPreset[] = [
  { id: 'classic', label: 'Classique', icon: '🎲', rules: DEFAULT_RULES },
  {
    id: 'quick',
    label: 'Rapide',
    icon: '⚡',
    rules: { ...DEFAULT_RULES, pawnsPerPlayer: 2, exitOn: 'oneOrSix', exactFinish: false, threeSixesForfeit: false },
  },
  {
    id: 'strategy',
    label: 'Stratégie',
    icon: '🧠',
    rules: { ...DEFAULT_RULES, blocks: true, mustCaptureToEnterHome: true },
  },
  { id: 'teams', label: 'Équipes', icon: '🤝', rules: { ...DEFAULT_RULES, teams: true } },
];

export function matchPreset(rules: Rules): RulesPreset | undefined {
  return RULES_PRESETS.find((p) =>
    (Object.keys(p.rules) as (keyof Rules)[]).every((k) => p.rules[k] === rules[k]),
  );
}

/** Short descriptions of the rules that differ from a plain game. */
export function rulesSummary(rules: Rules): string[] {
  return [
    rules.exitOn === 'oneOrSix' && 'Sortie avec 1 ou 6',
    rules.threeSixesForfeit && 'Trois 6 = tour perdu',
    rules.exactFinish && 'Arrivée exacte',
    !rules.safeSquares && 'Pas de cases sûres',
    rules.blocks && 'Blocages',
    rules.bonusOnCapture && 'Capture = rejoue',
    rules.bonusOnFinish && 'Arrivée = rejoue',
    rules.mustCaptureToEnterHome && 'Capture obligatoire',
    rules.teams && 'Équipes 2 c. 2',
    rules.pawnsPerPlayer < 4 && `${rules.pawnsPerPlayer} pion${rules.pawnsPerPlayer > 1 ? 's' : ''} / joueur`,
  ].filter((r): r is string => !!r);
}

export const COLOR_LABEL: Record<Color, string> = {
  red: 'Rouge',
  green: 'Vert',
  yellow: 'Jaune',
  blue: 'Bleu',
};

export const BOT_LEVEL_LABEL: Record<BotLevel, string> = {
  easy: 'Facile',
  medium: 'Moyen',
  hard: 'Difficile',
};

export function playerName(state: GameState, color: Color): string {
  return state.players.find((p) => p.color === color)?.name ?? COLOR_LABEL[color];
}

export function rewardLineLabel(state: GameState, line: RewardLine): string {
  switch (line.type) {
    case 'opponent': {
      const who =
        line.opponent.kind === 'bot'
          ? `ordi ${BOT_LEVEL_LABEL[line.opponent.level].toLowerCase()}`
          : line.opponent.online
            ? 'en ligne'
            : 'joueur';
      return `Victoire sur ${playerName(state, line.color)} (${who})${line.forfeited ? ' · abandon, moitié' : ''}`;
    }
    case 'captures':
      return `${line.count} capture${line.count > 1 ? 's' : ''}`;
    case 'flawless':
      return 'Aucun pion capturé';
  }
}

export function describeEvent(state: GameState): string {
  const e = state.lastEvent;
  const current = state.players[state.current];
  const turn = `Au tour de ${current.name}`;
  if (!e) return turn;
  switch (e.type) {
    case 'start':
      return `La partie commence ! ${turn}.`;
    case 'roll':
      return `${playerName(state, e.color)} a fait ${e.value}. Choisis un pion.`;
    case 'noMoves':
      return `${playerName(state, e.color)} a fait ${e.value} : aucun coup possible. ${turn}.`;
    case 'threeSixes':
      return `${playerName(state, e.color)} a fait trois 6 : tour perdu ! ${turn}.`;
    case 'move': {
      const parts: string[] = [];
      if (e.captures.length > 0) {
        const victims = [...new Set(e.captures.map((c) => playerName(state, c.color)))].join(', ');
        parts.push(`${playerName(state, e.color)} capture ${victims} !`);
      }
      if (e.to === FINISHED) parts.push('Un pion arrive au centre !');
      parts.push(e.extraTurn ? `${current.name} rejoue.` : `${turn}.`);
      return parts.join(' ');
    }
    case 'forfeit':
      return `${playerName(state, e.color)} a quitté la partie et perd. ${turn}.`;
    case 'win': {
      const winners =
        e.colors.length > 1
          ? `L'équipe ${e.colors.map((c) => playerName(state, c)).join(' & ')} gagne`
          : `${playerName(state, e.colors[0])} gagne la partie`;
      return e.reason === 'forfeit' ? `${winners} : les adversaires ont abandonné !` : `${winners} !`;
    }
  }
}
