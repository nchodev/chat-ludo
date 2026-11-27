import {
  DEFAULT_RULES,
  FINISHED,
  type BotLevel,
  type Color,
  type GameState,
  type RewardLine,
  type Rules,
} from '@ludo/engine';
import { tr } from './i18n';

export interface RulesPreset {
  id: string;
  label: string;
  icon: string;
  rules: Rules;
}

export const RULES_PRESETS: RulesPreset[] = [
  {
    id: 'classic',
    get label() {
      return tr('Classique', 'Classic');
    },
    icon: '🎲',
    rules: DEFAULT_RULES,
  },
  {
    id: 'quick',
    get label() {
      return tr('Rapide', 'Quick');
    },
    icon: '⚡',
    rules: { ...DEFAULT_RULES, pawnsPerPlayer: 2, exitOn: 'oneOrSix', exactFinish: false, threeSixesForfeit: false },
  },
  {
    id: 'strategy',
    get label() {
      return tr('Stratégie', 'Strategy');
    },
    icon: '🧠',
    rules: { ...DEFAULT_RULES, blocks: true, mustCaptureToEnterHome: true },
  },
  {
    id: 'teams',
    get label() {
      return tr('Équipes', 'Teams');
    },
    icon: '🤝',
    rules: { ...DEFAULT_RULES, teams: true },
  },
];

export function matchPreset(rules: Rules): RulesPreset | undefined {
  return RULES_PRESETS.find((p) =>
    (Object.keys(p.rules) as (keyof Rules)[]).every((k) => p.rules[k] === rules[k]),
  );
}

/** Short descriptions of the rules that differ from a plain game. */
export function rulesSummary(rules: Rules): string[] {
  return [
    rules.exitOn === 'oneOrSix' && tr('Sortie avec 1 ou 6', 'Out on a 1 or 6'),
    rules.threeSixesForfeit && tr('Trois 6 = tour perdu', 'Three 6s = turn lost'),
    rules.exactFinish && tr('Arrivée exacte', 'Exact finish'),
    !rules.safeSquares && tr('Pas de cases sûres', 'No safe squares'),
    rules.blocks && tr('Blocages', 'Blocks'),
    rules.bonusOnCapture && tr('Capture = rejoue', 'Capture = roll again'),
    rules.bonusOnFinish && tr('Arrivée = rejoue', 'Finish = roll again'),
    rules.mustCaptureToEnterHome && tr('Capture obligatoire', 'Must capture'),
    rules.teams && tr('Équipes 2 c. 2', 'Teams 2 v 2'),
    rules.pawnsPerPlayer < 4 &&
      tr(`${rules.pawnsPerPlayer} pion${rules.pawnsPerPlayer > 1 ? 's' : ''} / joueur`, `${rules.pawnsPerPlayer} pawn${rules.pawnsPerPlayer > 1 ? 's' : ''} / player`),
  ].filter((r): r is string => !!r);
}

/** Labels read in the current language each time (getters). */
export const COLOR_LABEL: Record<Color, string> = {
  get red() {
    return tr('Rouge', 'Red');
  },
  get green() {
    return tr('Vert', 'Green');
  },
  get yellow() {
    return tr('Jaune', 'Yellow');
  },
  get blue() {
    return tr('Bleu', 'Blue');
  },
};

export const BOT_LEVEL_LABEL: Record<BotLevel, string> = {
  get easy() {
    return tr('Facile', 'Easy');
  },
  get medium() {
    return tr('Moyen', 'Medium');
  },
  get hard() {
    return tr('Difficile', 'Hard');
  },
};

export function playerName(state: GameState, color: Color): string {
  return state.players.find((p) => p.color === color)?.name ?? COLOR_LABEL[color];
}

export function rewardLineLabel(state: GameState, line: RewardLine): string {
  switch (line.type) {
    case 'opponent': {
      const who =
        line.opponent.kind === 'bot'
          ? tr(`ordi ${BOT_LEVEL_LABEL[line.opponent.level].toLowerCase()}`, `${BOT_LEVEL_LABEL[line.opponent.level].toLowerCase()} computer`)
          : line.opponent.online
            ? tr('en ligne', 'online')
            : tr('joueur', 'player');
      return tr(
        `Victoire sur ${playerName(state, line.color)} (${who})${line.forfeited ? ' · abandon, moitié' : ''}`,
        `Win against ${playerName(state, line.color)} (${who})${line.forfeited ? ' · forfeit, half' : ''}`,
      );
    }
    case 'captures':
      return tr(`${line.count} capture${line.count > 1 ? 's' : ''}`, `${line.count} capture${line.count > 1 ? 's' : ''}`);
    case 'flawless':
      return tr('Aucun pion capturé', 'No pawn captured');
  }
}

export function describeEvent(state: GameState): string {
  const e = state.lastEvent;
  const current = state.players[state.current];
  const turn = tr(`Au tour de ${current.name}`, `${current.name}’s turn`);
  if (!e) return turn;
  switch (e.type) {
    case 'start':
      return tr(`La partie commence ! ${turn}.`, `The game begins! ${turn}.`);
    case 'roll':
      return tr(`${playerName(state, e.color)} a fait ${e.value}. Choisis un pion.`, `${playerName(state, e.color)} rolled ${e.value}. Pick a pawn.`);
    case 'noMoves':
      return tr(
        `${playerName(state, e.color)} a fait ${e.value} : aucun coup possible. ${turn}.`,
        `${playerName(state, e.color)} rolled ${e.value}: no move possible. ${turn}.`,
      );
    case 'threeSixes':
      return tr(`${playerName(state, e.color)} a fait trois 6 : tour perdu ! ${turn}.`, `${playerName(state, e.color)} rolled three 6s: turn lost! ${turn}.`);
    case 'move': {
      const parts: string[] = [];
      if (e.captures.length > 0) {
        const victims = [...new Set(e.captures.map((c) => playerName(state, c.color)))].join(', ');
        parts.push(tr(`${playerName(state, e.color)} capture ${victims} !`, `${playerName(state, e.color)} captures ${victims}!`));
      }
      if (e.to === FINISHED) parts.push(tr('Un pion arrive au centre !', 'A pawn reaches the centre!'));
      parts.push(e.extraTurn ? tr(`${current.name} rejoue.`, `${current.name} rolls again.`) : `${turn}.`);
      return parts.join(' ');
    }
    case 'forfeit':
      return tr(`${playerName(state, e.color)} a quitté la partie et perd. ${turn}.`, `${playerName(state, e.color)} left the game and loses. ${turn}.`);
    case 'win': {
      const winners =
        e.colors.length > 1
          ? tr(`L'équipe ${e.colors.map((c) => playerName(state, c)).join(' & ')} gagne`, `Team ${e.colors.map((c) => playerName(state, c)).join(' & ')} wins`)
          : tr(`${playerName(state, e.colors[0])} gagne la partie`, `${playerName(state, e.colors[0])} wins the game`);
      return e.reason === 'forfeit' ? tr(`${winners} : les adversaires ont abandonné !`, `${winners}: the opponents gave up!`) : `${winners}${tr(' !', '!')}`;
    }
  }
}
