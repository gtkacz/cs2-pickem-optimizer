import type { Team, TeamPair } from '../data/types.ts';
import type { MatchOutcome } from '../swiss/stage.ts';
import { pairKey } from '../swiss/stage.ts';
import type { ScenarioOverride, ScenarioStage } from '../swiss/scenario.ts';
import { escape } from './picks.ts';

type MatchView = { round: number; teamIds: TeamPair; winnerId: string | null };

export function bracket(view: ScenarioStage, teams: Map<string, Team>, changes: ScenarioOverride[], path: MatchOutcome[]) {
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
  const label = (id: string, winnerId: string | null) => {
    const team = teams.get(id);
    const initials = escape((team?.name ?? id).split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase());
    return `<span class="team-line ${id === winnerId ? 'winner' : ''}"><span class="seed">${records.get(id)?.seed ?? '–'}</span>
      <span class="team-logo" aria-hidden="true">${team ? `<img data-logo src="${escape(team.logoUrl)}" alt="" width="22" height="22" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${initials}</span></span>
      <span class="team-name">${name(id)}</span>${id === winnerId ? '<span class="match-winner"><span aria-hidden="true">✓</span><span class="visually-hidden">Winner</span></span>' : ''}</span>`;
  };
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
      const canEdit = !view.reason && knownKeys.has(id);
      group.push(`<details class="match"><summary><span class="match-teams">${label(match.teamIds[0], winner)}<span class="match-vs" aria-hidden="true">vs</span>${label(match.teamIds[1], winner)}</span><small class="match-status match-status--${provenance.toLowerCase()}">${provenance}</small></summary>
        <div class="match-detail">${provenance === 'Official' ? '<p class="match-source">Official result</p>' : ''}${oldWinner && oldWinner !== winner ? `<p>Official winner · ${name(oldWinner)}</p>` : ''}
        ${canEdit ? `<div class="match-actions">${match.teamIds.map(teamId => `<button data-action="edit" data-match="${escape(id)}" data-team="${escape(teamId)}">Set ${name(teamId)} as winner</button>`).join('')}<button data-action="edit" data-match="${escape(id)}">Clear result</button></div>` : ''}</div></details>`);
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
          const group = finishes.get(result) ?? [];
          group.push(name(teamId));
          finishes.set(result, group);
        }
      }
    }
    const lanes = { upper: [] as string[], middle: [] as string[], lower: [] as string[] };
    for (const [record, rows] of groups) {
      const [wins, losses] = record.split('–').map(Number);
      const lane = wins > losses ? 'upper' : wins < losses ? 'lower' : 'middle';
      lanes[lane].push(`<section class="record"><h3>${record}</h3>${rows.join('')}</section>`);
    }
    for (const [record, names] of finishes) {
      const qualified = record.startsWith('3–');
      const outcome = `<div class="finish finish--${qualified ? 'qualified' : 'eliminated'}"><strong>${record}</strong><span>${names.join(' · ')}</span></div>`;
      if (qualified) lanes.upper.unshift(outcome);
      else lanes.lower.push(outcome);
    }
    return `<details class="round" ${matches.length ? 'open' : ''}><summary><strong>Round ${round}</strong><small>${matches.length ? `${matches.length} matches` : 'Pairings pending'}</small></summary>
      <div class="round-lanes">${Object.entries(lanes).map(([lane, rows]) =>
        `<div class="round-lane round-lane--${lane}">${rows.join('')}</div>`).join('')}</div>
    </details>`;
  }).join('');
}
