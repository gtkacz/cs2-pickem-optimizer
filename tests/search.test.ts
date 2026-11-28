import { expect, test } from 'vitest';
import { createSearch, scorePicks, type Pick } from '../src/solver/search.ts';
import { resolveRules } from '../src/swiss/rules.ts';
import { applyRound, startStage, type MatchOutcome } from '../src/swiss/stage.ts';
import type { Stage } from '../src/data/types.ts';

test('a resumed search proves a witness and obeys fixed winners', () => {
  const rulesetId = 'major-swiss-v1';
  const rules = resolveRules(rulesetId)!;
  const entrants = Array.from({ length: 16 }, (_, index) => ({ teamId: `t${index}`, seed: index + 1 }));
  let state = startStage({ id: 's1' } as Stage, entrants, rules);
  while (state.round < 5) {
    state = applyRound(state, rules.pairRound(state).map(match => ({ ...match, winnerId: match.teamIds[0] })), rules);
  }
  const fixtures = rules.pairRound(state);
  const fixed = [{ ...fixtures[0], winnerId: fixtures[0].teamIds[1] }];
  const picks = fixtures.map(match => ({ teamId: match.teamIds[0], category: 'advance' as const }));
  const search = createSearch({ rulesetId, state, fixed, picks, target: 1 });
  expect(search.step(1).optimal).toBe(false);
  const result = search.step(100);
  expect(result.optimal).toBe(true);
  expect(result.best?.score).toBe(2);
  expect(scorePicks(applyRound(state, result.best!.path, rules), picks)).toBe(2);
  expect(result.best?.path[0].winnerId).toBe(fixed[0].winnerId);
  // The fixed match loses its pick, so a target of 1 needs a pick to win either of the two free matches: 3 of 4 paths.
  expect(result.odds.even).toEqual({ chance: 0.75, exact: true });
  // Every team left is 2–2, so weighing by record changes nothing.
  expect(result.odds.record).toEqual(result.odds.even);
});

test('odds are exactly zero when the target exceeds the picks, even before round 1', () => {
  const rulesetId = 'major-swiss-v1';
  const entrants = Array.from({ length: 16 }, (_, index) => ({ teamId: `t${index}`, seed: index + 1 }));
  const state = startStage({ id: 's1' } as Stage, entrants, resolveRules(rulesetId)!);
  const picks = [{ teamId: 't0', category: 'undefeated' as const }];
  const never = { chance: 0, exact: true };
  expect(createSearch({ rulesetId, state, fixed: [], picks, target: 5 }).step(0).odds).toEqual({ even: never, record: never });
});

test('sampled odds repeat exactly for the same sheet', () => {
  const rulesetId = 'major-swiss-v1';
  const entrants = Array.from({ length: 16 }, (_, index) => ({ teamId: `t${index}`, seed: index + 1 }));
  const state = startStage({ id: 's1' } as Stage, entrants, resolveRules(rulesetId)!);
  const picks = [0, 1, 2, 3, 4].map(index => ({ teamId: `t${index}`, category: 'advance' as const }));
  const odds = () => createSearch({ rulesetId, state, fixed: [], picks, target: 2 }).step(0).odds;
  const first = odds();
  expect(first.even.exact).toBe(false);
  // Before round 1 every team is 0–0, so both models draw the same paths.
  expect(first.record).toEqual(first.even);
  expect(odds()).toEqual(first);
});

test('weighing by record favors the better record held when the search starts', () => {
  const rulesetId = 'major-swiss-v1';
  const rules = resolveRules(rulesetId)!;
  const entrants = Array.from({ length: 16 }, (_, index) => ({ teamId: `t${index}`, seed: index + 1 }));
  let state = startStage({ id: 's1' } as Stage, entrants, rules);
  while (state.round < 4) {
    state = applyRound(state, rules.pairRound(state).map(match => ({ ...match, winnerId: match.teamIds[0] })), rules);
  }
  const odds = (picks: Pick[], fixed: MatchOutcome[] = []) =>
    createSearch({ rulesetId, state, fixed, picks, target: picks.length }).step(0).odds;

  // Round 4 pairs equal records, so it stays a coin flip. Fixing it leaves one decider between a team that
  // started the search 2–1 (strength 3/2) and one that started 1–2 (strength 2/3): 9/13 against 4/13.
  const fixed = rules.pairRound(state).map(match => ({ ...match, winnerId: match.teamIds[1] }));
  const record = (teamId: string) => `${state.teams[teamId].wins}-${state.teams[teamId].losses}`;
  const decider = rules.pairRound(applyRound(state, fixed, rules)).find(match => record(match.teamIds[0]) !== record(match.teamIds[1]))!;
  const [favorite, underdog] = record(decider.teamIds[0]) === '2-1' ? decider.teamIds : [decider.teamIds[1], decider.teamIds[0]];
  expect(record(underdog)).toBe('1-2');
  const favored = odds([{ teamId: favorite, category: 'advance' }], fixed);
  expect(favored.even).toEqual({ chance: 0.5, exact: true });
  expect(favored.record.chance).toBeCloseTo(9 / 13);
  expect(odds([{ teamId: underdog, category: 'advance' }], fixed).record.chance).toBeCloseTo(4 / 13);

  // The weights are still probabilities: across the field, exactly eight teams reach three wins.
  const qualified = entrants.reduce((total, { teamId }) => {
    const category = state.teams[teamId].losses === 0 ? 'undefeated' : 'advance';
    return total + odds([{ teamId, category }]).record.chance;
  }, 0);
  expect(qualified).toBeCloseTo(8);
});
