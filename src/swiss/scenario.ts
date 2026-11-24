import type { Major, Stage } from '../data/types.ts';
import { resolveRules } from './rules.ts';
import { applyRound, officialStage, pairKey, startStage, type Fixture, type MatchOutcome, type OfficialStage } from './stage.ts';

export type ScenarioOverride = Fixture & { stageId: string; winnerId: string | null; source: 'edited' | 'simulated' };
export type ScenarioStage = OfficialStage & { qualifiers: string[]; divergent: boolean };
export type MajorScenario = { stages: Record<string, ScenarioStage>; overrides: ScenarioOverride[] };
const fixtureKey = (fixture: Fixture) => `${fixture.round}/${pairKey(fixture.teamIds)}`;

function replay(stage: Stage, baseline: OfficialStage, overrides: ScenarioOverride[], predecessor?: ScenarioStage) {
  const waiting: ScenarioStage = { ...baseline, qualifiers: [], divergent: false };
  const rules = resolveRules(stage.rulesetId);
  if (!rules || (baseline.reason && baseline.entrants.length === 16)) return { effective: waiting, valid: [] };
  let entrants = baseline.entrants;
  if (predecessor) {
    if (!predecessor.state?.complete) {
      if (predecessor.divergent || entrants.length !== stage.entrants.length) {
        return { effective: { ...waiting, fixtures: [], fixed: [], state: undefined, reason: 'Scenario entrants are pending the preceding stage', divergent: predecessor.divergent }, valid: [] };
      }
    } else if (predecessor.divergent || entrants.length !== stage.entrants.length) {
      entrants = stage.entrants.flatMap(slot => {
        const teamId = slot.source.type === 'direct' ? slot.source.teamId : predecessor.qualifiers[slot.source.position - 1];
        return teamId ? [{ teamId, seed: slot.seed }] : [];
      });
    }
  }
  if (entrants.length !== 16) return { effective: waiting, valid: [] };
  const baselineSeeds = new Map(baseline.entrants.map(entry => [entry.seed, entry.teamId]));
  let divergent = entrants.some(entry => baselineSeeds.get(entry.seed) !== entry.teamId);
  let state = startStage(stage, entrants, rules);
  const valid: ScenarioOverride[] = [];
  const official = new Map(stage.matches.map(match => [fixtureKey(match), match.winnerId]));
  const changes = new Map(overrides.map(change => [fixtureKey(change), change]));
  while (!state.complete) {
    const fixtures = rules.pairRound(state);
    const fixed: MatchOutcome[] = [];
    let changedThisRound = false;
    for (const fixture of fixtures) {
      const key = fixtureKey(fixture);
      const original = divergent ? null : official.get(key) ?? null;
      const change = changes.get(key);
      let winnerId = original;
      if (change && (change.winnerId === null || fixture.teamIds.includes(change.winnerId))) {
        winnerId = change.winnerId;
        valid.push(change);
        changedThisRound ||= winnerId !== original;
      }
      if (winnerId !== null) fixed.push({ ...fixture, winnerId });
    }
    divergent ||= changedThisRound;
    if (fixed.length !== fixtures.length) {
      return { effective: { ...baseline, entrants, fixtures, fixed, state, qualifiers: [], divergent, reason: undefined }, valid };
    }
    state = applyRound(state, fixed, rules);
  }
  return {
    effective: { ...baseline, entrants, state, fixtures: [], fixed: [], qualifiers: rules.rankQualifiers(state), divergent, reason: undefined },
    valid,
  };
}

export function buildScenario(major: Major, overrides: readonly ScenarioOverride[]): MajorScenario {
  const stages: Record<string, ScenarioStage> = Object.create(null);
  const valid: ScenarioOverride[] = [];
  for (const stage of major.stages) {
    const { effective, valid: applied } = replay(stage, officialStage(major, stage.id),
      overrides.filter(change => change.stageId === stage.id), stage.predecessorId ? stages[stage.predecessorId] : undefined);
    stages[stage.id] = effective;
    valid.push(...applied);
  }
  return { stages, overrides: valid };
}

export function setOutcome(major: Major, overrides: readonly ScenarioOverride[], change: ScenarioOverride): ScenarioOverride[] {
  const before = buildScenario(major, overrides);
  const selected = before.stages[change.stageId];
  const fixtures = selected?.state?.completedRounds[change.round - 1] ?? selected?.fixtures ?? [];
  if (!fixtures.some(match => fixtureKey(match) === fixtureKey(change)) ||
    (change.winnerId !== null && !change.teamIds.includes(change.winnerId))) throw new Error('That matchup is unavailable');
  const current = [...(selected.state?.completedRounds[change.round - 1] ?? []), ...selected.fixed]
    .find(match => fixtureKey(match) === fixtureKey(change));
  if ((current?.winnerId ?? null) === change.winnerId) return before.overrides;
  const affected = new Set([change.stageId]);
  for (const stage of major.stages) {
    if (stage.predecessorId && affected.has(stage.predecessorId)) affected.add(stage.id);
  }
  const retained = overrides.filter(item => !affected.has(item.stageId) || (
    item.stageId === change.stageId && item.round <= change.round && fixtureKey(item) !== fixtureKey(change)
  ));
  retained.push(change);
  for (const stage of major.stages) {
    if (stage.id === change.stageId || !affected.has(stage.id)) continue;
    const next = buildScenario(major, retained).stages[stage.id];
    const oldSeeds = new Map(before.stages[stage.id].entrants.map(entry => [entry.seed, entry.teamId]));
    if (!next.reason && next.entrants.length === oldSeeds.size && next.entrants.every(entry => oldSeeds.get(entry.seed) === entry.teamId)) {
      retained.push(...before.overrides.filter(item => item.stageId === stage.id));
    }
  }
  return buildScenario(major, retained).overrides;
}

export function applyPath(major: Major, overrides: readonly ScenarioOverride[], stageId: string, outcomes: readonly MatchOutcome[]) {
  const effective = buildScenario(major, overrides).stages[stageId];
  const stage = major.stages.find(item => item.id === stageId);
  const rules = stage && resolveRules(stage.rulesetId);
  if (!effective?.state || effective.reason || !rules) throw new Error('The stage cannot be simulated');
  const protections = new Map(effective.fixed.map(match => [fixtureKey(match), match.winnerId]));
  const additions: ScenarioOverride[] = outcomes.flatMap(match => {
    if (!protections.has(fixtureKey(match))) return [{ ...match, stageId, source: 'simulated' }];
    if (protections.get(fixtureKey(match)) !== match.winnerId) throw new Error('The path changes a fixed result');
    return [];
  });
  const addedKeys = new Set(additions.map(fixtureKey));
  const retained = overrides.filter(change => change.stageId !== stageId || !addedKeys.has(fixtureKey(change)));
  const result = buildScenario(major, [...retained, ...additions]);
  if (additions.some(change => !result.overrides.includes(change))) throw new Error('The path contains an invalid matchup');
  return result.overrides;
}
