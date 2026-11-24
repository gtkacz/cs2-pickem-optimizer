import { expect, test } from 'vitest';
import { createArchive, parseMajorIndex, parseMajor } from '../src/data/archive.ts';

const entry = { id: 'test', name: 'Test Major', startDate: '2025-01-01', dataPath: 'data/majors/test.json' };
const major = {
  schemaVersion: 1, id: 'test', revision: '1',
  teams: [{ id: 'a', name: 'A', logoUrl: 'https://img-cdn.hltv.org/a' }, { id: 'b', name: 'B', logoUrl: 'https://img-cdn.hltv.org/b' }],
  stages: [{
    id: 's1', name: 'Stage 1', rulesetId: 'swiss', pickem: { undefeatedSlots: 1, winlessSlots: 1, advanceSlots: 0, targetCorrect: 1 },
    entrants: [{ seed: 1, source: { type: 'direct', teamId: 'a' } }, { seed: 2, source: { type: 'direct', teamId: 'b' } }],
    matches: [{ id: 'm', round: 1, teamIds: ['a', 'b'], winnerId: null }],
  }],
};

test('validates archive references and preserves unresolved fixtures', () => {
  expect(parseMajor(major, 'test').stages[0].matches[0].winnerId).toBeNull();
  const invalid = structuredClone(major);
  invalid.stages[0].entrants[1].seed = 1;
  expect(() => parseMajor(invalid, 'test')).toThrow(/seed/i);
  expect(() => parseMajor(major, 'other')).toThrow(/id/i);
  expect(() => parseMajorIndex({ schemaVersion: 1, majors: [{ ...entry, dataPath: '../other.json' }] })).toThrow(/path/i);
  expect(parseMajorIndex({ schemaVersion: 1, majors: [{ ...entry, logoUrl: 'https://img-cdn.hltv.org/eventlogo/x.png' }] }).majors[0].logoUrl).toContain('hltv');
  expect(parseMajorIndex({ schemaVersion: 1, majors: [{ ...entry, logoUrl: 'https://www.pglesports.com/images/logo.webp' }] }).majors[0].logoUrl).toContain('pgl');
  expect(parseMajorIndex({ schemaVersion: 1, majors: [{ ...entry, logoUrl: 'http://example.com/x.png' }] }).majors[0].logoUrl).toBeUndefined();
  const inline = 'data:image/png;base64,iVBORw0KGgo=';
  expect(parseMajorIndex({ schemaVersion: 1, majors: [{ ...entry, logoUrl: inline }] }).majors[0].logoUrl).toBe(inline);
  const withInline = structuredClone(major);
  withInline.teams[0].logoUrl = inline;
  expect(parseMajor(withInline, 'test').teams[0].logoUrl).toBe(inline);
  withInline.teams[0].logoUrl = 'data:text/html;base64,PHA+';
  expect(() => parseMajor(withInline, 'test')).toThrow(/logo/i);
});

test('deduplicates concurrent reads and retries a failed request', async () => {
  let calls = 0;
  const archive = createArchive(new URL('https://example.com/app/'), async () => {
    if (++calls === 1) throw new Error('offline');
    return Response.json(major);
  });
  await expect(archive.loadMajor(entry)).rejects.toThrow('offline');
  const loaded = await Promise.all([archive.loadMajor(entry), archive.loadMajor(entry)]);
  expect(calls).toBe(2);
  expect(loaded[0]).toEqual(loaded[1]);
});
