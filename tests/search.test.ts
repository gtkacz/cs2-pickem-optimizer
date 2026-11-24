import { expect, test } from 'vitest';
import { createSearch, scorePicks } from '../src/solver/search.ts';
import { resolveRules } from '../src/swiss/rules.ts';
import { applyRound, startStage } from '../src/swiss/stage.ts';
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
  const search = createSearch({ rulesetId, state, fixed, picks });
  expect(search.step(1).optimal).toBe(false);
  const result = search.step(100);
  expect(result.optimal).toBe(true);
  expect(result.best?.score).toBe(2);
  expect(scorePicks(applyRound(state, result.best!.path, rules), picks)).toBe(2);
  expect(result.best?.path[0].winnerId).toBe(fixed[0].winnerId);
});
