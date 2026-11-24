import type { Major, RecordedMatch, Stage, TeamPair } from '../data/types.ts';
import { resolveRules, type SwissRules } from './rules.ts';

export type SeededTeam = { teamId: string; seed: number };
export type Fixture = { round: number; teamIds: TeamPair };
export type MatchOutcome = Fixture & { winnerId: string };
type TeamRecord = { wins: number; losses: number; opponents: string[] };
export type StageState = {
  stageId: string; entrants: SeededTeam[]; round: number; complete: boolean;
  teams: Record<string, TeamRecord>; completedRounds: MatchOutcome[][];
};
export type OfficialStage = {
  entrants: SeededTeam[]; matches: RecordedMatch[]; fixtures: Fixture[];
  fixed: MatchOutcome[]; state?: StageState; reason?: string;
};

export function pairKey(pair: TeamPair) {
  return [...pair].sort().join('/');
}

export function startStage(stage: Stage, entrants: SeededTeam[], rules: SwissRules): StageState {
  if (entrants.length !== 16 || rules.wins !== 3 || rules.losses !== 3) {
    throw new Error('This ruleset requires 16 seeded entrants');
  }
  return {
    stageId: stage.id, round: 1, complete: false, entrants,
    teams: Object.fromEntries(entrants.map(({ teamId }) => [teamId, { wins: 0, losses: 0, opponents: [] }])),
    completedRounds: [],
  };
}

export function applyRound(state: StageState, outcomes: MatchOutcome[], rules: SwissRules): StageState {
  const expected = new Set(rules.pairRound(state).map(match => pairKey(match.teamIds)));
  if (state.complete || expected.size !== outcomes.length) throw new Error('Round is incomplete');
  const teams = { ...state.teams };
  for (const match of outcomes) {
    if (match.round !== state.round || !expected.delete(pairKey(match.teamIds)) || !match.teamIds.includes(match.winnerId)) {
      throw new Error('Result does not match the expected pairing');
    }
    const loser = match.teamIds.find(id => id !== match.winnerId)!;
    const winner = teams[match.winnerId];
    const defeated = teams[loser];
    teams[match.winnerId] = { ...winner, wins: winner.wins + 1, opponents: [...winner.opponents, loser] };
    teams[loser] = { ...defeated, losses: defeated.losses + 1, opponents: [...defeated.opponents, match.winnerId] };
  }
  return {
    ...state, teams, round: state.round + 1, completedRounds: [...state.completedRounds, outcomes],
    complete: Object.values(teams).every(team => team.wins === rules.wins || team.losses === rules.losses),
  };
}

export function officialStage(major: Major, stageId: string): OfficialStage {
  const stage = major.stages.find(candidate => candidate.id === stageId);
  if (!stage) return { entrants: [], matches: [], fixtures: [], fixed: [], reason: 'Stage not found' };
  const entrants = stage.entrants.flatMap(slot => {
    const teamId = slot.source.type === 'direct' ? slot.source.teamId : slot.officialTeamId;
    return teamId ? [{ teamId, seed: slot.seed }] : [];
  });
  const base = { entrants, matches: stage.matches, fixtures: [], fixed: [] };
  const rules = resolveRules(stage.rulesetId);
  if (!rules) return { ...base, reason: 'This stage’s pairing rules are unavailable' };
  if (entrants.length !== 16) return { ...base, reason: 'Waiting for the full list of entrants' };
  let state = startStage(stage, entrants, rules);
  while (!state.complete) {
    const fixtures = rules.pairRound(state);
    const expected = new Set(fixtures.map(match => pairKey(match.teamIds)));
    const recorded = stage.matches.filter(match => match.round === state.round);
    if (recorded.some(match => !expected.has(pairKey(match.teamIds)))) {
      return { ...base, state, reason: 'An official pairing differs from the stage rules' };
    }
    const fixed = recorded.flatMap(({ winnerId, round, teamIds }) => winnerId ? [{ winnerId, round, teamIds }] : []);
    if (fixed.length !== fixtures.length) {
      if (stage.matches.some(match => match.round > state.round)) {
        return { ...base, state, reason: 'An earlier round is missing official results' };
      }
      return { ...base, state, fixtures, fixed };
    }
    state = applyRound(state, fixed, rules);
  }
  if (stage.matches.some(match => match.round >= state.round)) {
    return { ...base, reason: 'Official fixtures continue past stage completion' };
  }
  return { ...base, state };
}

export function defaultStage(major: Major): Stage | undefined {
  const statuses = new Map(major.stages.map(stage => [stage.id, officialStage(major, stage.id)]));
  const complete = (id: string) => statuses.get(id)?.state?.complete === true;
  const started = (stage: Stage) => stage.matches.some(match => match.winnerId !== null);
  return major.stages.find(stage => !complete(stage.id) && started(stage))
    ?? major.stages.find((stage, index) => !complete(stage.id) && !started(stage)
      && (index === 0 || (stage.predecessorId !== undefined && complete(stage.predecessorId))))
    ?? [...major.stages].reverse().find(stage => complete(stage.id));
}
