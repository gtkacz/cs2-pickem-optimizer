import type { Stage, Team } from '../data/types.ts';
import type { Pick, PickCategory } from '../solver/search.ts';
import type { SeededTeam } from '../swiss/stage.ts';

export const escape = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

export const categories: [PickCategory, string, keyof Stage['pickem']][] = [
  ['undefeated', '3–0', 'undefeatedSlots'], ['winless', '0–3', 'winlessSlots'], ['advance', '3–1 / 3–2', 'advanceSlots'],
];

export function pickSheet(stage: Stage, entrants: SeededTeam[], teams: Map<string, Team>, picks: Pick[]) {
  const active = new Set(entrants.map(team => team.teamId));
  const label = (id: string) => escape(teams.get(id)?.name ?? id);
  return categories.map(([category, title, limit]) => {
    const chosen = picks.filter(pick => pick.category === category);
    const options = entrants.filter(({ teamId }) => !picks.some(pick => pick.teamId === teamId));
    return `<section class="pick-group"><h3>${title} <small>${chosen.length} / ${stage.pickem[limit]}</small></h3>
      <div class="pick-list">${chosen.map(({ teamId }) => `<button class="chip" data-action="remove" data-team="${escape(teamId)}" aria-label="Remove ${label(teamId)} from ${title}">${label(teamId)}${active.has(teamId) ? '' : ' · Didn’t qualify in this scenario'} <span aria-hidden="true">×</span></button>`).join('')}</div>
      ${chosen.length < stage.pickem[limit] && options.length ? `<select data-category="${category}" aria-label="Add a ${title} pick"><option value="">Add a team</option>${options.map(({ teamId, seed }) => `<option value="${escape(teamId)}">${seed}. ${label(teamId)}</option>`).join('')}</select>` : ''}
    </section>`;
  }).join('');
}
