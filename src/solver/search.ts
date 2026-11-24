import { resolveRules } from '../swiss/rules.ts';
import { applyRound, pairKey, type MatchOutcome, type StageState } from '../swiss/stage.ts';

export type PickCategory = 'undefeated' | 'winless' | 'advance';
export type Pick = { teamId: string; category: PickCategory };
export type SearchInput = { rulesetId: string; state: StageState; fixed: MatchOutcome[]; picks: Pick[] };
export type SearchProgress = { best: { score: number; path: MatchOutcome[] } | null; upperBound: number; optimal: boolean };

function correct(wins: number, losses: number, category: PickCategory) {
  if (category === 'undefeated') return wins === 3 && losses === 0;
  if (category === 'winless') return wins === 0 && losses === 3;
  return wins === 3 && (losses === 1 || losses === 2);
}

export function scorePicks(state: StageState, picks: readonly Pick[]) {
  return picks.filter(({ teamId, category }) => {
    const team = state.teams[teamId];
    return team && correct(team.wins, team.losses, category);
  }).length;
}

function bound(state: StageState, picks: Pick[]) {
  return picks.filter(({ teamId, category }) => {
    const team = state.teams[teamId];
    if (!team) return false;
    if (team.wins === 3 || team.losses === 3) return correct(team.wins, team.losses, category);
    if (category === 'undefeated') return team.losses === 0;
    if (category === 'winless') return team.wins === 0;
    return true;
  }).length;
}

export function createSearch(input: SearchInput) {
  const rules = resolveRules(input.rulesetId);
  if (!rules) throw new Error('Pairing rules unavailable');
  const activeRules = rules;
  const fixed = new Map(input.fixed.map(match => [pairKey(match.teamIds), match.winnerId]));
  type Node = { state: StageState; path: MatchOutcome[]; bound: number };
  let best: SearchProgress['best'] = null;
  const frontier: Node[] = [{ state: input.state, path: [], bound: bound(input.state, input.picks) }];

  function expand(node: Node) {
    const fixtures = activeRules.pairRound(node.state);
    const chosen: MatchOutcome[] = [];
    const children: Node[] = [];
    function add(index: number): void {
      if (index === fixtures.length) {
        const outcomes = chosen.slice();
        const state = applyRound(node.state, outcomes, activeRules);
        const upper = bound(state, input.picks);
        if (upper > (best?.score ?? -1)) children.push({ state, path: [...node.path, ...outcomes], bound: upper });
        return;
      }
      const match = fixtures[index];
      const winner = node.state.round === input.state.round ? fixed.get(pairKey(match.teamIds)) : undefined;
      for (const winnerId of winner ? [winner] : match.teamIds) {
        chosen.push({ ...match, winnerId });
        add(index + 1);
        chosen.pop();
      }
    }
    add(0);
    children.sort((a, b) => a.bound - b.bound);
    frontier.push(...children);
  }

  return {
    step(maxNodes: number): SearchProgress {
      for (let index = 0; index < maxNodes && frontier.length; index++) {
        const node = frontier.pop()!;
        if (node.bound <= (best?.score ?? -1)) continue;
        if (node.state.complete) {
          best = { score: scorePicks(node.state, input.picks), path: node.path };
        } else {
          expand(node);
        }
      }
      const upperBound = frontier.reduce((upper, node) => Math.max(upper, node.bound), best?.score ?? 0);
      return { best, upperBound, optimal: best !== null && upperBound === best.score };
    },
  };
}
