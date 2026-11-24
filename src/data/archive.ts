import type { Major, MajorIndex, MajorIndexEntry } from './types.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const isId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const integer = (value: unknown, min = 1): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
const unique = (values: unknown[]) => new Set(values).size === values.length;
const archivePath = (value: unknown) => typeof value === 'string' && /^data\/majors\/[a-z0-9][a-z0-9-]*\.json$/.test(value);

function logoUrl(value: unknown) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.hostname === 'hltv.org' || url.hostname.endsWith('.hltv.org'));
  } catch {
    return false;
  }
}

export function parseMajorIndex(input: unknown): MajorIndex {
  const index = input as MajorIndex | null;
  assert(index?.schemaVersion === 1 && Array.isArray(index.majors), 'Invalid archive index');
  for (const entry of index.majors) {
    assert(entry && isId(entry.id) && nonempty(entry.name), 'Invalid Major index entry');
    assert(typeof entry.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.startDate) && Number.isFinite(Date.parse(entry.startDate)), 'Invalid Major date');
    assert(archivePath(entry.dataPath), 'Invalid Major path');
    assert(entry.logoUrl === undefined || logoUrl(entry.logoUrl), 'Invalid Major logo URL');
  }
  assert(unique(index.majors.map(entry => entry.id)), 'Duplicate Major ID');
  return index;
}

export function parseMajor(input: unknown, expectedId: string): Major {
  const major = input as Major | null;
  assert(major?.schemaVersion === 1 && isId(major.id) && major.id === expectedId, 'Invalid Major ID or schema version');
  assert(nonempty(major.revision) && Array.isArray(major.teams) && Array.isArray(major.stages), 'Invalid Major payload');
  for (const team of major.teams) {
    assert(team && isId(team.id) && nonempty(team.name) && logoUrl(team.logoUrl), 'Invalid team or HLTV logo URL');
  }
  assert(unique(major.teams.map(team => team.id)), 'Duplicate team ID');
  const teams = new Set(major.teams.map(team => team.id));
  const stages = new Set<string>();
  for (const stage of major.stages) {
    assert(stage && isId(stage.id) && nonempty(stage.name) && isId(stage.rulesetId) && !stages.has(stage.id), 'Invalid or duplicate stage ID');
    assert(stage.predecessorId === undefined || stages.has(stage.predecessorId), 'Invalid stage predecessor');
    stages.add(stage.id);
    const picks = stage.pickem;
    assert(picks && integer(picks.undefeatedSlots, 0) && integer(picks.winlessSlots, 0) && integer(picks.advanceSlots, 0)
      && integer(picks.targetCorrect, 0) && picks.targetCorrect <= picks.undefeatedSlots + picks.winlessSlots + picks.advanceSlots, 'Invalid Pick’Em settings');
    assert(Array.isArray(stage.entrants) && Array.isArray(stage.matches), 'Invalid stage entrants or matches');
    for (const slot of stage.entrants) {
      assert(slot && integer(slot.seed) && slot.source, 'Invalid entrant seed');
      const source = slot.source;
      assert(source.type === 'direct' ? teams.has(source.teamId) && (!slot.officialTeamId || slot.officialTeamId === source.teamId)
        : source.type === 'qualifier' && stage.predecessorId && integer(source.position), 'Invalid entrant source or team');
      assert(slot.officialTeamId === undefined || teams.has(slot.officialTeamId), 'Invalid official entrant');
    }
    assert(unique(stage.entrants.map(slot => slot.seed)), 'Duplicate stage seed');
    assert(unique(stage.entrants.flatMap(slot => slot.source.type === 'qualifier' ? [slot.source.position] : [])), 'Duplicate qualifier position');
    const known = stage.entrants.flatMap(slot => slot.source.type === 'direct' ? [slot.source.teamId] : slot.officialTeamId ? [slot.officialTeamId] : []);
    assert(unique(known), 'Duplicate stage team');
    const knownEntrants = new Set(known);
    const roundTeams = new Set<string>();
    for (const match of stage.matches) {
      assert(match && isId(match.id) && integer(match.round) && Array.isArray(match.teamIds)
        && match.teamIds.length === 2 && unique(match.teamIds) && match.teamIds.every(team => teams.has(team)), 'Invalid match fixture');
      assert(match.winnerId === null || match.teamIds.includes(match.winnerId), 'Winner is outside the fixture');
      for (const team of match.teamIds) {
        const key = `${match.round}/${team}`;
        assert(!roundTeams.has(key) && (known.length !== stage.entrants.length || knownEntrants.has(team)), 'Invalid team in round');
        roundTeams.add(key);
      }
    }
    assert(unique(stage.matches.map(match => match.id)), 'Duplicate match ID');
  }
  return major;
}

export function createArchive(baseUrl: URL, fetcher: typeof fetch = fetch) {
  const cache = new Map<string, Promise<unknown>>();
  function load<T>(path: string, parse: (input: unknown) => T): Promise<T> {
    const previous = cache.get(path);
    if (previous) return previous as Promise<T>;
    const request = Promise.resolve().then(async () => {
      const response = await fetcher(new URL(path, baseUrl), { redirect: 'error' });
      if (!response.ok) throw new Error(`Archive request failed (${response.status})`);
      return parse(await response.json());
    }).catch((error: unknown) => {
      cache.delete(path);
      throw error;
    });
    cache.set(path, request);
    return request;
  }
  return {
    loadIndex: () => load('data/majors.json', parseMajorIndex),
    async loadMajor(entry: MajorIndexEntry) {
      assert(archivePath(entry.dataPath), 'Invalid Major path');
      const major = await load(entry.dataPath, input => parseMajor(input, entry.id));
      assert(major.id === entry.id, 'Invalid Major ID');
      return major;
    },
  };
}
