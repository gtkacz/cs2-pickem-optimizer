import type { Fixture, StageState } from './stage.ts';

export type SwissRules = {
  wins: number;
  losses: number;
  pairRound(state: StageState): Fixture[];
  rankQualifiers(state: StageState): string[];
};

const wins = 3;
const losses = 3;

function difficulty(state: StageState, teamId: string) {
  return state.teams[teamId].opponents.reduce((score, opponent) => {
    const record = state.teams[opponent];
    return score + record.wins - record.losses;
  }, 0);
}

function ranked(state: StageState) {
  return [...state.entrants].sort((a, b) =>
    state.teams[b.teamId].wins - state.teams[a.teamId].wins ||
    state.teams[a.teamId].losses - state.teams[b.teamId].losses ||
    difficulty(state, b.teamId) - difficulty(state, a.teamId) ||
    a.seed - b.seed);
}

function pairGroup(state: StageState, ids: string[]): Fixture[] {
  const half = ids.length / 2;
  const high = ids.slice(0, half);
  const low = ids.slice(half).reverse();
  let best: string[] = [];
  let bestRematches = Number.POSITIVE_INFINITY;
  function visit(remaining: string[], order: string[], rematches: number): void {
    if (rematches >= bestRematches) return;
    if (!remaining.length) {
      best = order;
      bestRematches = rematches;
      return;
    }
    const prior = state.teams[high[order.length]].opponents;
    for (const opponent of remaining) {
      visit(remaining.filter(id => id !== opponent), [...order, opponent], rematches + Number(prior.includes(opponent)));
    }
  }
  visit(low, [], 0);
  return high.map((teamId, index) => ({ round: state.round, teamIds: [teamId, best[index]] }));
}

const majorSwiss: SwissRules = {
  wins,
  losses,
  pairRound(state) {
    if (state.complete) return [];
    if (state.round === 1) {
      const seeds = [...state.entrants].sort((a, b) => a.seed - b.seed);
      const half = seeds.length / 2;
      return seeds.slice(0, half).map(({ teamId }, index) => ({
        round: 1, teamIds: [teamId, seeds[half + index].teamId],
      }));
    }
    const groups = new Map<string, string[]>();
    for (const { teamId } of ranked(state)) {
      const team = state.teams[teamId];
      if (team.wins === wins || team.losses === losses) continue;
      const key = `${team.wins}-${team.losses}`;
      const group = groups.get(key) ?? [];
      group.push(teamId);
      groups.set(key, group);
    }
    return [...groups.values()].flatMap(group => pairGroup(state, group));
  },
  rankQualifiers(state) {
    return ranked(state).filter(({ teamId }) => state.teams[teamId].wins === wins).map(({ teamId }) => teamId);
  },
};

export function resolveRules(id: string): SwissRules | undefined {
  return id === 'major-swiss-v1' ? majorSwiss : undefined;
}
