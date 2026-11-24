import type { Stage, Team } from '../data/types.ts';
import type { Pick, PickCategory } from '../solver/search.ts';
import type { SeededTeam } from '../swiss/stage.ts';
import { chevron, cross } from './icons.ts';

export const escape = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

export const categories: [PickCategory, string, keyof Stage['pickem']][] = [
  ['undefeated', '3–0', 'undefeatedSlots'], ['advance', '3–1 / 3–2', 'advanceSlots'], ['winless', '0–3', 'winlessSlots'],
];

export function teamLogo(team: Team | undefined, id: string): string {
  const initials = escape((team?.name ?? id).split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase());
  return `<span class="team-logo" aria-hidden="true">${team ? `<img data-logo src="${escape(team.logoUrl)}" alt="" width="22" height="22" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${initials}</span></span>`;
}

export function pickSheet(stage: Stage, entrants: SeededTeam[], teams: Map<string, Team>, picks: Pick[], fresh = '') {
  const active = new Set(entrants.map(team => team.teamId));
  const label = (id: string) => escape(teams.get(id)?.name ?? id);
  return categories.map(([category, title, limit]) => {
    const slots = stage.pickem[limit];
    const chosen = picks.filter(pick => pick.category === category);
    const options = entrants.filter(({ teamId }) => !picks.some(pick => pick.teamId === teamId));
    const canAdd = chosen.length < slots && options.length > 0;
    const empty = Math.max(0, slots - chosen.length - (canAdd ? 1 : 0));
    return `<section class="pick-group pick-group--${category}"><h3>${title} <small>${chosen.length} / ${slots}</small></h3>
      <div class="pick-list">${chosen.map(({ teamId }) => {
        const eliminated = active.has(teamId) ? '' : 'Didn’t qualify in this scenario';
        return `<button class="chip" data-action="remove" data-team="${escape(teamId)}" ${teamId === fresh ? 'data-fresh' : ''} aria-label="Remove ${label(teamId)} from ${title}${eliminated ? ` (${eliminated})` : ''}">${teamLogo(teams.get(teamId), teamId)}<span class="chip-name">${label(teamId)}${eliminated ? `<small>${eliminated}</small>` : ''}</span>${cross}</button>`;
      }).join('')}
      ${canAdd ? `<span class="select slot-add"><select data-category="${category}" aria-label="Add a ${title} pick"><option value="">Add a team</option>${options.map(({ teamId, seed }) => `<option value="${escape(teamId)}">${seed}. ${label(teamId)}</option>`).join('')}</select>${chevron}</span>` : ''}
      ${'<span class="slot" aria-hidden="true"></span>'.repeat(empty)}</div>
    </section>`;
  }).join('');
}
