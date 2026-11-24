import { expect, test } from 'vitest';
import { applyPath, buildScenario, setOutcome } from '../src/swiss/scenario.ts';
import type { Major, Stage } from '../src/data/types.ts';

const entrants = Array.from({ length: 16 }, (_, index) => ({ seed: index + 1, source: { type: 'direct' as const, teamId: `t${index + 1}` } }));
const first: Stage = {
  id: 's1', name: 'Stage 1', rulesetId: 'major-swiss-v1', entrants,
  pickem: { undefeatedSlots: 2, winlessSlots: 2, advanceSlots: 6, targetCorrect: 5 },
  matches: entrants.slice(0, 8).map(({ source }, index) => ({
    id: `m${index}`, round: 1, teamIds: [source.teamId, entrants[index + 8].source.teamId], winnerId: source.teamId,
  })),
};
const second: Stage = {
  ...first, id: 's2', predecessorId: 's1', matches: [],
  entrants: entrants.map(({ seed }) => ({ seed, source: seed <= 8 ? { type: 'direct', teamId: `new${seed}` } : { type: 'qualifier', position: seed - 8 } })),
};
const major: Major = { schemaVersion: 1, id: 'major', revision: '1', stages: [first, second], teams: [] };

test('reopens a played match and keeps its siblings fixed', () => {
  const change = { stageId: 's1', round: 1, teamIds: first.matches[0].teamIds, winnerId: null, source: 'edited' as const };
  const edited = setOutcome(major, [], change);
  const stage = buildScenario(major, edited).stages.s1;
  expect(stage.state?.round).toBe(1);
  expect(stage.fixed).toHaveLength(7);
  expect(buildScenario(major, edited).stages.s2.reason).toMatch(/pending/i);
});

test('resolves a changed stage and passes its qualifiers to the successor', () => {
  let overrides = setOutcome(major, [], { stageId: 's1', round: 1, teamIds: first.matches[0].teamIds, winnerId: 't9', source: 'edited' });
  for (let round = 2; round <= 5; round++) {
    const stage = buildScenario(major, overrides).stages.s1;
    overrides = applyPath(major, overrides, 's1', stage.fixtures.map(match => ({ ...match, winnerId: match.teamIds[0] })));
  }
  const { s1, s2 } = buildScenario(major, overrides).stages;
  expect(s2.entrants.slice(8).map(entry => entry.teamId)).toEqual(s1.qualifiers);
  expect(s2.fixtures).toHaveLength(8);
});
