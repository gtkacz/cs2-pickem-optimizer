import { expect, test } from 'vitest';
import { resolveRules } from '../src/swiss/rules.ts';
import { startStage, applyRound, officialStage, defaultStage, pairKey } from '../src/swiss/stage.ts';
import type { Major, Stage } from '../src/data/types.ts';

const entrants = Array.from({ length: 16 }, (_, index) => ({ teamId: `t${index + 1}`, seed: index + 1 }));
const stage: Stage = {
  id: 's1', name: 'Stage 1', rulesetId: 'major-swiss-v1',
  pickem: { undefeatedSlots: 2, winlessSlots: 2, advanceSlots: 6, targetCorrect: 5 },
  entrants: entrants.map(({ teamId, seed }) => ({ seed, source: { type: 'direct', teamId } })),
  matches: [],
};

test('replays a full Swiss stage with correctly sized rounds and no avoidable rematches', () => {
  const rules = resolveRules(stage.rulesetId)!;
  let state = startStage(stage, entrants, rules);
  expect(pairKey(rules.pairRound(state)[0].teamIds)).toBe('t1/t9');
  const sizes = [];
  while (!state.complete) {
    const fixtures = rules.pairRound(state);
    sizes.push(fixtures.length);
    for (const { teamIds: [a, b] } of fixtures) expect(state.teams[a].opponents).not.toContain(b);
    state = applyRound(state, fixtures.map(fixture => ({ ...fixture, winnerId: fixture.teamIds[0] })), rules);
  }
  expect(sizes).toEqual([8, 8, 8, 6, 3]);
  expect(rules.rankQualifiers(state)).toHaveLength(8);
});

test('does not treat a partial archive as a completed stage', () => {
  const partial = { ...stage, matches: [{ id: 'm1', round: 1, teamIds: ['t1', 't9'] as [string, string], winnerId: 't1' }] };
  const major: Major = { schemaVersion: 1, id: 'test', revision: '1', teams: [], stages: [partial, { ...stage, id: 's2', predecessorId: 's1' }] };
  expect(officialStage(major, 's1').state?.complete).toBe(false);
  expect(defaultStage(major)?.id).toBe('s1');
  const conflict = { ...partial, matches: [{ ...partial.matches[0], teamIds: ['t1', 't2'] as [string, string] }] };
  expect(officialStage({ ...major, stages: [conflict] }, 's1').reason).toMatch(/pairing/i);
});
