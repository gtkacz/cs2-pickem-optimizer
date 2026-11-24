import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseMajor } from '../src/data/archive.ts';
import { buildScenario } from '../src/swiss/scenario.ts';
import { defaultStage, officialStage } from '../src/swiss/stage.ts';

for (const id of ['austin-2025', 'budapest-2025']) {
  test(`${id} reproduces every recorded round and advancement seed`, () => {
    const major = parseMajor(JSON.parse(readFileSync(new URL(`../public/data/majors/${id}.json`, import.meta.url), 'utf8')), id);
    const scenario = buildScenario(major, []);
    expect(defaultStage(major)?.id).toBe('stage-3');
    for (const stage of major.stages) {
      const official = officialStage(major, stage.id);
      const effective = scenario.stages[stage.id];
      expect(official.reason).toBeUndefined();
      expect(official.state?.complete).toBe(true);
      expect(official.state?.completedRounds.flat()).toHaveLength(33);
      expect(effective.qualifiers).toHaveLength(8);
      for (const slot of stage.entrants) {
        if (slot.source.type === 'qualifier') {
          expect(slot.officialTeamId).toBe(scenario.stages[stage.predecessorId!].qualifiers[slot.source.position - 1]);
        }
      }
    }
  });
}

test('preserves official replay errors and ignores re-selecting a fixed winner', async () => {
  const { setOutcome } = await import('../src/swiss/scenario.ts');
  const major = parseMajor(JSON.parse(readFileSync(new URL('../public/data/majors/austin-2025.json', import.meta.url), 'utf8')), 'austin-2025');
  const [first, second] = major.stages;
  const original = first.matches[0];
  const edit = { ...second.matches[0], stageId: second.id, source: 'edited' as const, winnerId: null };
  expect(setOutcome(major, [edit], { ...original, stageId: first.id, source: 'edited' })).toEqual([edit]);
  first.matches.push({ ...original, id: 'after-stage', round: 6 });
  expect(buildScenario(major, []).stages[first.id].reason).toMatch(/past stage completion/i);
});
