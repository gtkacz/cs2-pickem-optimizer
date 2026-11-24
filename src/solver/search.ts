import { resolveRules, type SwissRules } from '../swiss/rules.ts';
import { applyRound, pairKey, type Fixture, type MatchOutcome, type StageState } from '../swiss/stage.ts';

export type PickCategory = 'undefeated' | 'winless' | 'advance';
export type Pick = { teamId: string; category: PickCategory };
export type SearchInput = { rulesetId: string; state: StageState; fixed: MatchOutcome[]; picks: Pick[]; target: number };
export type Odds = { chance: number; exact: boolean };
export type SearchProgress = { best: { score: number; path: MatchOutcome[] } | null; upperBound: number; optimal: boolean; odds: Odds };

const EXACT_FLIP_LIMIT = 17;
const SAMPLE_COUNT = 10_000;
const SAMPLE_SEED = 1;

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

// mulberry32: a fixed seed makes a sampled estimate identical on every run of the same sheet.
function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

// Every unfixed match is a fair coin flip, so each outcome path is equally likely. Enumerating all of them is
// infeasible from round 1 (2^33 paths), hence sampling above EXACT_FLIP_LIMIT.
function winOdds(input: SearchInput, rules: SwissRules, fixed: Map<string, string>): Odds {
  if (bound(input.state, input.picks) < input.target) return { chance: 0, exact: true };
  const lockedWinner = (state: StageState, match: Fixture) =>
    state.round === input.state.round ? fixed.get(pairKey(match.teamIds)) : undefined;
  // Walks the outcome tree so each round is paired once per branch rather than once per path.
  function hitShare(state: StageState): number {
    if (bound(state, input.picks) < input.target) return 0;
    if (state.complete) return 1;
    const fixtures = rules.pairRound(state);
    const free = fixtures.filter(match => !lockedWinner(state, match));
    let share = 0;
    for (let mask = 0; mask < 2 ** free.length; mask++) {
      const outcomes = fixtures.map(match => ({
        ...match, winnerId: lockedWinner(state, match) ?? match.teamIds[(mask >> free.indexOf(match)) & 1],
      }));
      share += hitShare(applyRound(state, outcomes, rules));
    }
    return share / 2 ** free.length;
  }
  function samplePath(random: () => number) {
    let state = input.state;
    while (!state.complete) {
      const outcomes = rules.pairRound(state).map(match => ({
        ...match, winnerId: lockedWinner(state, match) ?? match.teamIds[random() < 0.5 ? 0 : 1],
      }));
      state = applyRound(state, outcomes, rules);
    }
    return scorePicks(state, input.picks) >= input.target;
  }
  let flips = 0;
  samplePath(() => { flips++; return 0; });
  if (flips <= EXACT_FLIP_LIMIT) return { chance: hitShare(input.state), exact: true };
  const random = seededRandom(SAMPLE_SEED);
  let hits = 0;
  for (let path = 0; path < SAMPLE_COUNT; path++) {
    if (samplePath(random)) hits++;
  }
  return { chance: hits / SAMPLE_COUNT, exact: false };
}

export function createSearch(input: SearchInput) {
  const rules = resolveRules(input.rulesetId);
  if (!rules) throw new Error('Pairing rules unavailable');
  const activeRules = rules;
  const fixed = new Map(input.fixed.map(match => [pairKey(match.teamIds), match.winnerId]));
  type Node = { state: StageState; path: MatchOutcome[]; bound: number };
  const odds = winOdds(input, activeRules, fixed);
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
      return { best, upperBound, optimal: best !== null && upperBound === best.score, odds };
    },
  };
}
