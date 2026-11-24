import type { Major } from '../data/types.ts';
import type { Pick } from '../solver/search.ts';
import { buildScenario, type ScenarioOverride } from '../swiss/scenario.ts';

export type SavedMajor = { picksByStage: Record<string, Pick[]>; overrides: ScenarioOverride[] };
const key = (major: Major) => `pickem-v1/${major.id}`;

export function loadSavedMajor(storage: Storage, major: Major): SavedMajor {
  const empty = { picksByStage: {}, overrides: [] };
  try {
    const raw = JSON.parse(storage.getItem(key(major)) ?? 'null');
    if (!raw || typeof raw !== 'object') return empty;
    const picksByStage = Object.fromEntries(major.stages.map(stage => {
      const picks: Pick[] = [];
      const limits = { undefeated: stage.pickem.undefeatedSlots, winless: stage.pickem.winlessSlots, advance: stage.pickem.advanceSlots };
      const candidates = raw.picksByStage?.[stage.id];
      for (const pick of Array.isArray(candidates) ? candidates : []) {
        if (!pick || typeof pick.teamId !== 'string' || !Object.hasOwn(limits, pick.category)) continue;
        const category = pick.category as Pick['category'];
        if (limits[category] > 0 && !picks.some(entry => entry.teamId === pick.teamId)) {
          limits[category]--;
          picks.push({ teamId: pick.teamId, category });
        }
      }
      return [stage.id, picks];
    }));
    const overrides = raw.revision === major.revision && Array.isArray(raw.overrides) ? (raw.overrides as Partial<ScenarioOverride>[]).filter((change): change is ScenarioOverride => !!(change &&
      typeof change.stageId === 'string' && Number.isSafeInteger(change.round) &&
      Array.isArray(change.teamIds) && change.teamIds.length === 2 &&
      change.teamIds.every((id: unknown) => typeof id === 'string') &&
      (change.winnerId === null || typeof change.winnerId === 'string') &&
      (change.source === 'edited' || change.source === 'simulated'))) : [];
    return { picksByStage, overrides: buildScenario(major, overrides).overrides };
  } catch {
    return empty;
  }
}

export function saveMajor(storage: Storage, major: Major, state: SavedMajor): boolean {
  try {
    storage.setItem(key(major), JSON.stringify({ revision: major.revision, ...state }));
    return true;
  } catch {
    return false;
  }
}
