import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSavedMajor, saveMajor } from '../src/ui/state.ts';
import type { Major } from '../src/data/types.ts';

test('keeps saved picks when a new archive revision invalidates scenario edits', () => {
  const major: Major = JSON.parse(readFileSync(new URL('../public/data/majors/austin-2025.json', import.meta.url), 'utf8'));
  const stage = major.stages[0];
  const match = stage.matches[0];
  let stored = '';
  const storage: Storage = {
    length: 1, key: () => null, clear: () => { stored = ''; }, removeItem: () => { stored = ''; },
    getItem: () => stored, setItem: (_key, data) => { stored = data; },
  };
  const picks = [{ teamId: match.teamIds[0], category: 'undefeated' as const }];
  saveMajor(storage, major, { picksByStage: { [stage.id]: picks }, overrides: [{ ...match, stageId: stage.id, winnerId: null, source: 'edited' }] });
  expect(loadSavedMajor(storage, major).overrides).toHaveLength(1);
  const revised = loadSavedMajor(storage, { ...major, revision: 'new' });
  expect(revised.overrides).toEqual([]);
  expect(revised.picksByStage[stage.id]).toEqual(picks);
});
