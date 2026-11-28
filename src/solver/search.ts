import { resolveRules, type SwissRules } from '../swiss/rules.ts';
import { applyRound, pairKey, type Fixture, type MatchOutcome, type StageState } from '../swiss/stage.ts';

export type PickCategory = 'undefeated' | 'winless' | 'advance';
export type Pick = { teamId: string; category: PickCategory };
export type SearchInput = { rulesetId: string; state: StageState; fixed: MatchOutcome[]; picks: Pick[]; target: number };
export type Odds = { chance: number; exact: boolean };
// 'even' flips a fair coin for every unplayed match. 'record' favors the team with the better record at the start of the search.
export type OddsModel = 'even' | 'record';
export type SearchProgress = {
  best: { score: number; path: MatchOutcome[] } | null; upperBound: number; optimal: boolean; odds: Record<OddsModel, Odds>;
};

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

// Under 'even' every unfixed match is a fair coin flip, so each outcome path is equally likely. Under 'record' a path
// counts for the product of its match probabilities. Enumerating all paths is infeasible from round 1 (2^33 paths),
// hence sampling above EXACT_FLIP_LIMIT.
function winOdds(input: SearchInput, base: SwissRules, fixed: Map<string, string>): Record<OddsModel, Odds> {
  const never = { chance: 0, exact: true };
  if (bound(input.state, input.picks) < input.target) return { even: never, record: never };
  // applyRound pairs the round again to validate it, so remembering each state's fixtures halves the pairing work.
  const pairings = new WeakMap<StageState, Fixture[]>();
  const rules: SwissRules = {
    ...base,
    pairRound(state) {
      let fixtures = pairings.get(state);
      if (!fixtures) pairings.set(state, fixtures = base.pairRound(state));
      return fixtures;
    },
  };
  // Bradley–Terry strength (wins + 1) / (losses + 1): a 2–0 team beats a 1–1 team 75% of the time and a 0–2 team 90%.
  // It stays frozen at the record held when the search starts, because Swiss only pairs equal records and a strength
  // that followed the simulated record would turn every match back into a coin flip.
  const strength = (teamId: string) => (input.state.teams[teamId].wins + 1) / (input.state.teams[teamId].losses + 1);
  const firstWins: Record<OddsModel, (match: Fixture) => number> = {
    even: () => 0.5,
    record: ({ teamIds: [first, second] }) => strength(first) / (strength(first) + strength(second)),
  };
  const lockedWinner = (state: StageState, match: Fixture) =>
    state.round === input.state.round ? fixed.get(pairKey(match.teamIds)) : undefined;
  // Walks the outcome tree so each round is paired once per branch rather than once per path, and once for both models.
  function hitShare(state: StageState): Record<OddsModel, number> {
    if (bound(state, input.picks) < input.target) return { even: 0, record: 0 };
    if (state.complete) return { even: 1, record: 1 };
    const fixtures = rules.pairRound(state);
    const free = fixtures.filter(match => !lockedWinner(state, match));
    const favored = free.map(firstWins.record);
    const share = { even: 0, record: 0 };
    for (let mask = 0; mask < 2 ** free.length; mask++) {
      const outcomes = fixtures.map(match => ({
        ...match, winnerId: lockedWinner(state, match) ?? match.teamIds[(mask >> free.indexOf(match)) & 1],
      }));
      const hit = hitShare(applyRound(state, outcomes, rules));
      share.even += hit.even / 2 ** free.length;
      share.record += hit.record * favored.reduce((weight, chance, index) => weight * ((mask >> index) & 1 ? 1 - chance : chance), 1);
    }
    return share;
  }
  function samplePath(random: () => number, model: OddsModel) {
    let state = input.state;
    while (!state.complete) {
      const outcomes = rules.pairRound(state).map(match => ({
        ...match, winnerId: lockedWinner(state, match) ?? match.teamIds[random() < firstWins[model](match) ? 0 : 1],
      }));
      state = applyRound(state, outcomes, rules);
    }
    return scorePicks(state, input.picks) >= input.target;
  }
  let flips = 0;
  samplePath(() => { flips++; return 0; }, 'even');
  if (flips <= EXACT_FLIP_LIMIT) {
    const share = hitShare(input.state);
    return { even: { chance: share.even, exact: true }, record: { chance: share.record, exact: true } };
  }
  function sample(model: OddsModel): Odds {
    const random = seededRandom(SAMPLE_SEED);
    let hits = 0;
    for (let path = 0; path < SAMPLE_COUNT; path++) {
      if (samplePath(random, model)) hits++;
    }
    return { chance: hits / SAMPLE_COUNT, exact: false };
  }
  const even = sample('even');
  // While every team has the same record the two models are the same model, so the paths need not be drawn twice.
  const level = new Set(input.state.entrants.map(({ teamId }) => strength(teamId))).size === 1;
  return { even, record: level ? even : sample('record') };
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
