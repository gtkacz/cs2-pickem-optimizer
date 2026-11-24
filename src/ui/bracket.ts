import type { Team, TeamPair } from '../data/types.ts';
import type { Pick, PickCategory } from '../solver/search.ts';
import type { MatchOutcome } from '../swiss/stage.ts';
import { pairKey } from '../swiss/stage.ts';
import type { ScenarioOverride, ScenarioStage } from '../swiss/scenario.ts';
import { check, chevron, cross } from './icons.ts';
import { escape, teamLogo } from './picks.ts';

type MatchView = { round: number; teamIds: TeamPair; winnerId: string | null };
type Editable = { id: string; result: string | null };

const pickBadges: Record<PickCategory, [string, string]> = {
  undefeated: ['3–0', '3–0 pick'], advance: ['ADV', '3–1 / 3–2 pick'], winless: ['0–3', '0–3 pick'],
};

export function bracket(view: ScenarioStage, teams: Map<string, Team>, changes: ScenarioOverride[], path: MatchOutcome[], picks: Pick[]) {
  const key = (match: MatchView) => `${match.round}/${pairKey(match.teamIds)}`;
  const official = new Map(view.matches.map(match => [key(match), match.winnerId]));
  const edited = new Map(changes.map(change => [key({ ...change }), change.source]));
  const planned = new Map(path.map(match => [key(match), match]));
  const records = new Map(view.entrants.map(entry => [entry.teamId, { wins: 0, losses: 0, seed: entry.seed }]));
  const known: MatchView[] = view.reason ? view.matches : [
    ...(view.state?.completedRounds.flat() ?? []),
    ...view.fixtures.map(fixture => ({
      ...fixture,
      winnerId: view.fixed.find(match => key(match) === key({ ...fixture, winnerId: null }))?.winnerId ?? null,
    })),
  ];
  const knownKeys = new Set(known.map(key));
  const visible = [...known, ...path.filter(match => !knownKeys.has(key(match)))];
  const name = (id: string) => escape(teams.get(id)?.name ?? id);
  const picked = new Map(picks.map(pick => [pick.teamId, pick.category]));
  const team = (id: string, winnerId: string | null, editable?: Editable) => {
    const seed = records.get(id)?.seed;
    const category = picked.get(id);
    const content = `<span class="seed"><span class="visually-hidden">Seed </span>${seed === undefined ? '–' : `<span aria-hidden="true">#</span>${seed}`}</span>
      ${teamLogo(teams.get(id), id)}<span class="team-name">${name(id)}</span>
      ${category ? `<span class="pick-badge pick-badge--${category}" title="Your ${pickBadges[category][1]}">${pickBadges[category][0]}</span>` : ''}
      <span class="match-winner">${id === winnerId ? `${check}<span class="visually-hidden">Winner</span>` : ''}</span>`;
    const attributes = `class="team ${id === winnerId ? 'winner' : ''}" title="${name(id)} · Seed ${seed ?? '–'}"`;
    if (!editable) return `<span ${attributes}>${content}</span>`;
    // Pressing the team that already holds the result reopens the match, like un-picking on HLTV.
    const clears = editable.result === id;
    return `<button ${attributes} data-action="edit" data-match="${escape(editable.id)}" data-team="${escape(id)}" ${clears ? 'data-clear' : ''}
      aria-label="${clears ? `Clear result (${name(id)} won)` : `Set ${name(id)} as winner`}">${content}</button>`;
  };
  let carried = { upper: [] as string[], lower: [] as string[] };
  return Array.from({ length: 5 }, (_, index) => {
    const round = index + 1;
    const matches = visible.filter(match => match.round === round);
    const groups = new Map<string, string[]>();
    const finishes = new Map<string, string[]>();
    for (const match of matches) {
      const record = records.get(match.teamIds[0]);
      const groupKey = record ? `${record.wins}–${record.losses}` : 'Matchups';
      const group = groups.get(groupKey) ?? [];
      const id = key(match);
      const oldWinner = official.get(id);
      const suggestion = planned.get(id);
      const winner = match.winnerId ?? suggestion?.winnerId ?? null;
      const source = edited.get(id);
      const provenance = source === 'edited' ? 'Edited' : source === 'simulated' ? 'Simulated'
        : suggestion && !match.winnerId ? 'Suggested' : match.winnerId && knownKeys.has(id) && match.winnerId === oldWinner ? 'Official'
          : suggestion ? 'Suggested' : 'Pending';
      const editable = !view.reason && knownKeys.has(id) ? { id, result: match.winnerId } : undefined;
      group.push(`<div class="match match--${provenance.toLowerCase()}">${team(match.teamIds[0], winner, editable)}<span class="match-vs" aria-hidden="true">vs</span>${team(match.teamIds[1], winner, editable)}
        <small class="match-status">${provenance}${oldWinner && oldWinner !== winner ? ` · official winner ${name(oldWinner)}` : ''}</small></div>`);
      groups.set(groupKey, group);
    }
    for (const match of matches) {
      const winner = match.winnerId ?? planned.get(key(match))?.winnerId;
      if (!winner) continue;
      for (const teamId of match.teamIds) {
        const record = records.get(teamId);
        if (!record) continue;
        if (teamId === winner) record.wins++;
        else record.losses++;
        if (record.wins === 3 || record.losses === 3) {
          const result = `${record.wins}–${record.losses} · ${record.wins === 3 ? 'Qualified' : 'Eliminated'}`;
          finishes.set(result, [...finishes.get(result) ?? [], teamId]);
        }
      }
    }
    const lanes = { upper: [] as string[], middle: [] as string[], lower: [] as string[] };
    for (const [record, rows] of groups) {
      const [wins, losses] = record.split('–').map(Number);
      const lane = wins > losses ? 'upper' : wins < losses ? 'lower' : 'middle';
      const stakes = wins === 2 && losses === 2 ? 'Decider' : wins === 2 ? 'Advancement' : losses === 2 ? 'Elimination' : '';
      lanes[lane].push(`<section class="record${stakes ? ` record--${stakes.toLowerCase()}` : ''}"><h3>${record}${stakes ? ` · ${stakes}` : ''}</h3>${rows.join('')}</section>`);
    }
    const outcomes = { upper: [] as string[], lower: [] as string[] };
    for (const [record, ids] of finishes) {
      const qualified = record.startsWith('3–');
      const kind = record.startsWith('3–0') ? 'undefeated' : record.startsWith('0–3') ? 'winless' : qualified ? 'advance' : 'eliminated';
      outcomes[qualified ? 'upper' : 'lower'].push(`<div class="finish finish--${qualified ? 'qualified' : 'eliminated'} finish--${kind}"><strong>${qualified ? check : cross}${record}</strong>
        <span class="finish-teams">${ids.map(id => team(id, null)).join('')}</span></div>`);
    }
    // Like the HLTV board, a team lands in the next column once its record is final; the last column keeps its own.
    const last = round === 5;
    const column = {
      upper: [...carried.upper, ...(last ? outcomes.upper : []), ...lanes.upper],
      middle: lanes.middle,
      lower: [...lanes.lower, ...carried.lower, ...(last ? outcomes.lower : [])],
    };
    carried = outcomes;
    return `<details class="round" ${matches.length ? 'open' : ''}><summary><strong>Round ${round}</strong><small>${matches.length ? `${matches.length} matches` : 'Pairings pending'}</small>${chevron}</summary>
      <div class="round-lanes">${Object.entries(column).map(([lane, rows]) =>
        `<div class="round-lane round-lane--${lane}">${rows.join('')}</div>`).join('')}</div>
    </details>`;
  }).join('');
}
