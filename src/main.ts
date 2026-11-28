import { createArchive } from './data/archive.ts';
import type { Major, MajorIndexEntry } from './data/types.ts';
import { createSolverClient } from './solver/client.ts';
import type { OddsModel, PickCategory, SearchProgress } from './solver/search.ts';
import { applyPath, buildScenario, setOutcome, type ScenarioOverride } from './swiss/scenario.ts';
import { defaultStage, pairKey } from './swiss/stage.ts';
import { bracket } from './ui/bracket.ts';
import { activeOption, closeCombo, moveCombo, openCombo } from './ui/combobox.ts';
import { check, chevron, cross, mark } from './ui/icons.ts';
import { escape, failedLogos, pickSheet } from './ui/picks.ts';
import { loadOddsModel, loadSavedMajor, saveMajor, saveOddsModel, type SavedMajor } from './ui/state.ts';
import './ui/styles.css';

const root = document.querySelector<HTMLElement>('#app')!;
const announcer = document.querySelector<HTMLElement>('#announcer')!;
const archive = createArchive(new URL(import.meta.env.BASE_URL, document.baseURI));
const storage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
} as Storage;
let catalog: MajorIndexEntry[] = [];
let major: Major | undefined;
let stageId = '';
let saved: SavedMajor = { picksByStage: {}, overrides: [] };
let undo: ScenarioOverride[] | undefined;
let progress: SearchProgress | undefined;
let running = false;
let message = '';
let loadSequence = 0;
let renderedStage = '';
let freshPick = '';
let oddsModel: OddsModel = loadOddsModel(storage);

const workerClient = createSolverClient(new Worker(new URL('./solver/solver.worker.ts', import.meta.url), { type: 'module' }), reply => {
  if (reply.type === 'error') {
    running = false;
    message = reply.message;
    render();
    return;
  }
  const refresh = running !== reply.running || progress?.best?.score !== reply.progress.best?.score;
  progress = reply.progress;
  running = reply.running;
  if (refresh) render();
});

function invalidate() {
  workerClient.cancel();
  progress = undefined;
  running = false;
  message = '';
}

function updateUrl() {
  if (!major) return;
  const url = new URL(location.href);
  url.searchParams.set('major', major.id);
  url.searchParams.set('stage', stageId);
  history.replaceState(null, '', url);
}

function current() {
  const stage = major?.stages.find(candidate => candidate.id === stageId);
  if (!major || !stage) return;
  const scenario = buildScenario(major, saved.overrides);
  return { stage, view: scenario.stages[stage.id], picks: saved.picksByStage[stage.id] ?? [] };
}

function persist() {
  if (major && !saveMajor(storage, major, saved)) {
    message = 'Browser storage is unavailable. Your changes are available in this tab.';
  }
}

// Live regions recreated by innerHTML are not reliably announced, so status text goes to a region that persists.
function announce() {
  const text = (message || root.querySelector('.score-line')?.textContent || '').replace(/\s+/g, ' ').trim();
  if (announcer.textContent !== text) announcer.textContent = text;
}

function render() {
  const selected = current();
  const active = document.activeElement as HTMLElement | null;
  const action = active?.dataset.action;
  const category = active?.dataset.category;
  const activeStage = active?.dataset.stage;
  const comboText = active instanceof HTMLInputElement ? active.value : '';
  const comboOpen = active?.getAttribute('aria-expanded') === 'true';
  const renderKey = `${major?.id ?? ''}/${stageId}`;
  const roundDisclosures = renderedStage === renderKey
    ? [...root.querySelectorAll<HTMLDetailsElement>('.round')].map(element => element.querySelector('.match') ? element.open : undefined)
    : [];
  renderedStage = renderKey;
  const activeMatch = active?.dataset.match;
  const activeTeam = active?.dataset.team;
  const formatter = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const entry = catalog.find(item => item.id === major?.id);
  root.innerHTML = `<header class="top"><a class="identity" href="${escape(import.meta.env.BASE_URL)}">${mark}CS2 Major PickPath</a>
    ${catalog.length ? `<label class="archive"><span>Major</span><span class="select select--logo">${entry?.logoUrl ? `<img class="major-logo" data-logo src="${escape(entry.logoUrl)}" alt="" width="20" height="20" referrerpolicy="no-referrer">` : ''}<select id="major-select">${catalog.map(item => `<option value="${escape(item.id)}" ${item.id === major?.id ? 'selected' : ''}>${escape(item.name)}</option>`).join('')}</select>${chevron}</span></label>` : ''}</header>
    <div class="title-row"><div><h1>${entry?.logoUrl ? `<img class="major-logo" data-logo src="${escape(entry.logoUrl)}" alt="" width="32" height="32" referrerpolicy="no-referrer">` : ''}${escape(entry?.name ?? 'Major Pick’Em simulator')}</h1>
      ${entry ? `<p class="subtitle">${formatter.format(new Date(entry.startDate))} · Swiss stages</p>` : ''}</div>
      ${major ? `<nav class="stages" aria-label="Major stages">${major.stages.map(stage => `<button data-action="stage" data-stage="${escape(stage.id)}" ${stage.id === stageId ? 'aria-current="page"' : ''}>${escape(stage.name)}</button>`).join('')}</nav>` : ''}</div>
    ${message ? `<p class="notice">${escape(message)} ${!selected ? '<button data-action="retry">Retry</button>' : ''}</p>` : ''}`;
  if (!selected || !major) { announce(); return; }
  const { stage, view, picks } = selected;
  const teams = new Map(major.teams.map(team => [team.id, team]));
  const stageChanges = saved.overrides.filter(change => change.stageId === stage.id);
  const path = progress?.best?.path ?? [];
  const scoreLabel = progress?.optimal ? 'Maximum achievable' : 'Best found';
  const next = major.stages.find(candidate => candidate.predecessorId === stage.id);
  const slots = stage.pickem.undefeatedSlots + stage.pickem.advanceSlots + stage.pickem.winlessSlots;
  const score = progress?.best?.score ?? 0;
  const reach = progress?.optimal ? score : progress?.upperBound ?? 0;
  const meter = Array.from({ length: slots }, (_, index) =>
    `<i class="meter-${index < score ? 'correct' : index < reach ? 'possible' : index < picks.length ? 'picked' : 'open'}"></i>`).join('');
  const hasPath = !running && path.length > 0;
  const odds = progress?.odds[oddsModel];
  // A sampled 0% or 100% only means no sample disagreed, so the extremes are shown as bounds.
  const oddsLabel = !odds ? '' : odds.exact ? `${(odds.chance * 100).toFixed(1)}%`
    : odds.chance < 0.01 ? '< 1%' : odds.chance > 0.99 ? '> 99%' : `≈ ${Math.round(odds.chance * 100)}%`;
  const fresh = freshPick;
  freshPick = '';
  root.insertAdjacentHTML('beforeend', `
    <div class="board">
      <section class="pick-sheet" aria-labelledby="picks-title"><div class="section-heading"><h2 id="picks-title">Pick sheet</h2><span>${picks.length} of ${slots} picked</span></div>
        <div class="pick-grid">${pickSheet(stage, view.entrants, teams, picks, fresh)}</div></section>
      <div class="score">
        <h2>Best possible score</h2>
        <p class="score-line">
          ${progress?.best ? `<strong class="figure">${progress.best.score}<span> / ${picks.length}</span></strong> ${scoreLabel}${progress.optimal ? '' : ` · Upper bound ${progress.upperBound}`}` : ''}
          ${progress?.best && progress.best.score >= stage.pickem.targetCorrect ? `<span class="score-note score-note--good">${check}Target reachable</span>` : progress && progress.upperBound < stage.pickem.targetCorrect ? `<span class="score-note score-note--bad">${cross}Target out of reach</span>` : ''}
          ${odds ? `<span class="score-note">${oddsLabel} of scenarios give ${stage.pickem.targetCorrect}+ correct${oddsModel === 'record' ? ', weighted by current record' : ''}${odds.exact ? '' : ' (sampled)'}</span>` : ''}
          ${view.reason ? `<span class="score-note">${escape(view.reason)}</span>` : running ? '<span class="score-note"><span class="spinner" aria-hidden="true"></span>Searching for the best outcome…</span>' : ''}
          ${!view.reason && !running && !progress ? 'Add picks and run the simulation to see a path to your best score.' : ''}
          ${!running && progress && !progress.best ? `Search paused · Upper bound ${progress.upperBound}` : ''}
        </p>
        ${odds ? `<button class="switch" role="switch" aria-checked="${oddsModel === 'record'}" data-action="weigh"><i aria-hidden="true"></i>Weigh by current record</button>` : ''}
        <div class="meter" aria-hidden="true" style="--slots: ${slots}; --target: ${stage.pickem.targetCorrect}">${meter}<span class="meter-target"><span>${stage.pickem.targetCorrect} needed</span></span></div>
        <div class="result-actions">
          ${hasPath ? '<button class="primary" data-action="apply">Apply this path</button>' : ''}
          ${running ? '<button data-action="pause">Pause search</button>' : ''}
          ${!running && !view.reason ? `<button class="${hasPath ? '' : 'primary'}" data-action="${progress && !progress.optimal ? 'continue' : 'run'}" ${!picks.length ? 'disabled' : ''}>${progress && !progress.optimal ? 'Continue search' : 'Run simulation'}</button>` : ''}
        </div>
      </div>
    </div>
    <section class="results" aria-labelledby="bracket-title">
      <div class="section-heading"><div><h2 id="bracket-title">Swiss bracket</h2><p><span class="mode mode--${view.reason ? 'archive' : view.divergent ? 'what-if' : 'official'}">${view.reason ? 'Official archive' : view.divergent ? 'What-if scenario' : 'Official results'}</span> · ${stage.pickem.targetCorrect} correct picks needed</p></div>
        <div class="scenario-actions">
          ${saved.overrides.length ? '<button data-action="reset">Reset to official results</button>' : ''}
          ${undo ? '<button data-action="undo">Undo reset</button>' : ''}
        </div></div>
      <ul class="legend" aria-hidden="true">
        <li><i class="legend-ring"></i>Result</li><li><i class="legend-ring legend-ring--simulated"></i>Applied from simulation</li>
        <li><i class="legend-ring legend-ring--suggested"></i>Suggested</li><li><i class="legend-ring legend-ring--edited"></i>Edited</li>
        <li><span class="pick-badge pick-badge--advance">ADV</span>Your pick</li><li><span class="pick-badge pick-badge--advance pick-badge--hit">ADV</span>Scores a point</li>
        <li><i class="legend-arrow legend-arrow--win"></i>Winners move</li><li><i class="legend-arrow legend-arrow--loss"></i>Losers move</li>
      </ul>
      ${view.qualifiers.length && next ? `<p class="notice qualifiers"><strong>${escape(next.name)} qualifiers</strong> ${view.qualifiers.map(id => escape(teams.get(id)?.name ?? id)).join(' · ')}</p>` : ''}
      <div class="bracket">${bracket(view, teams, stageChanges, path, picks)}</div>
    </section>`);
  root.querySelectorAll<HTMLDetailsElement>('.round').forEach((element, index) => {
    if (roundDisclosures[index] !== undefined) element.open = roundDisclosures[index];
  });
  if (activeStage) root.querySelector<HTMLElement>(`[data-stage="${CSS.escape(activeStage)}"]`)?.focus({ preventScroll: true });
  else if (category) {
    // A solver update re-renders mid-typing, so the search text and open list carry over.
    const combo = root.querySelector<HTMLInputElement>(`[data-category="${CSS.escape(category)}"]`);
    combo?.focus({ preventScroll: true });
    if (combo) { combo.value = comboText; if (comboOpen) openCombo(combo); }
  }
  else if (action === 'edit' && activeMatch && activeTeam) {
    root.querySelector<HTMLElement>(`[data-match="${CSS.escape(activeMatch)}"][data-team="${CSS.escape(activeTeam)}"]`)?.focus({ preventScroll: true });
  }
  else if (action && action !== 'edit') {
    const replacement = root.querySelector<HTMLElement>(`[data-action="${CSS.escape(action)}"]`)
      ?? root.querySelector<HTMLElement>('.result-actions .primary, .result-actions [data-action="pause"]');
    replacement?.focus({ preventScroll: true });
  }
  announce();
}

async function loadMajor(id?: string, requestedStage?: string) {
  const sequence = ++loadSequence;
  invalidate();
  major = undefined;
  undo = undefined;
  message = 'Loading Major…';
  render();
  const entry = catalog.find(item => item.id === id) ?? catalog[0];
  if (!entry) { message = 'The Major archive is empty.'; render(); return; }
  try {
    const loaded = await archive.loadMajor(entry);
    if (sequence !== loadSequence) return;
    major = loaded;
    saved = loadSavedMajor(storage, loaded);
    stageId = (loaded.stages.find(stage => stage.id === requestedStage) ?? defaultStage(loaded) ?? loaded.stages[0])?.id ?? '';
    message = stageId ? '' : 'No Swiss stages are available for this Major.';
    updateUrl();
  } catch {
    if (sequence !== loadSequence) return;
    message = 'Unable to load the Major. Try again.';
  }
  render();
}

async function start() {
  message = 'Loading Major archive…';
  render();
  try {
    catalog = (await archive.loadIndex()).majors.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
    const params = new URLSearchParams(location.search);
    await loadMajor(params.get('major') ?? undefined, params.get('stage') ?? undefined);
  } catch {
    message = 'Unable to load the Major archive. Try again.';
    render();
  }
}

root.addEventListener('error', event => {
  if (!(event.target instanceof HTMLImageElement) || !event.target.hasAttribute('data-logo')) return;
  failedLogos.add(event.target.getAttribute('src') ?? '');
  event.target.hidden = true;
}, true);

root.addEventListener('change', event => {
  if (event.target instanceof HTMLSelectElement && event.target.id === 'major-select') void loadMajor(event.target.value);
});

function addPick(input: HTMLInputElement, option: HTMLElement) {
  const selected = current();
  const teamId = option.dataset.team;
  if (!selected || !teamId || !input.dataset.category) return;
  input.value = '';
  closeCombo(input);
  invalidate();
  freshPick = teamId;
  saved.picksByStage[stageId] = [...selected.picks, { teamId, category: input.dataset.category as PickCategory }];
  persist();
  render();
}

const comboInput = (target: EventTarget | null) =>
  target instanceof HTMLInputElement && target.getAttribute('role') === 'combobox' ? target : undefined;

root.addEventListener('input', event => { const input = comboInput(event.target); if (input) openCombo(input); });
root.addEventListener('focusout', event => { const input = comboInput(event.target); if (input) closeCombo(input); });
// Keeps focus in the field while an option is pressed, so the list isn't closed before the click lands.
root.addEventListener('mousedown', event => { if (event.target instanceof Element && event.target.closest('.combo-list')) event.preventDefault(); });
root.addEventListener('keydown', event => {
  const input = comboInput(event.target);
  if (!input) return;
  const open = input.getAttribute('aria-expanded') === 'true';
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open) openCombo(input);
    moveCombo(input, event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Enter') {
    const option = activeOption(input);
    if (open && option) { event.preventDefault(); addPick(input, option); }
  } else if (event.key === 'Escape') {
    if (open) closeCombo(input);
    else input.value = '';
  }
});

root.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  const input = comboInput(target);
  if (input) { openCombo(input); return; }
  const option = target?.closest<HTMLElement>('.combo-list [role="option"]');
  const owner = option && comboInput(option.closest('.slot-add')?.querySelector('input') ?? null);
  if (option && owner) { addPick(owner, option); return; }
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null;
  if (!button) return;
  const { action, team, stage: targetStage, match } = button.dataset;
  if (action === 'retry') { void start(); return; }
  const selected = current();
  if (!major || !selected) return;
  const { stage, view, picks } = selected;
  try {
    switch (action) {
      case 'stage':
        if (targetStage) { invalidate(); stageId = targetStage; updateUrl(); }
        break;
      case 'remove':
        invalidate();
        saved.picksByStage[stageId] = picks.filter(pick => pick.teamId !== team);
        persist();
        break;
      case 'run':
        if (view.state && !view.reason && picks.length) {
          invalidate();
          running = true;
          workerClient.start({ rulesetId: stage.rulesetId, state: view.state, fixed: view.fixed, picks, target: stage.pickem.targetCorrect });
        }
        break;
      case 'pause': workerClient.pause(); return;
      case 'continue': running = true; workerClient.continue(); break;
      case 'edit': {
        const effective = [...(view.state?.completedRounds.flat() ?? []), ...view.fixtures];
        const fixture = effective.find(item => `${item.round}/${pairKey(item.teamIds)}` === match);
        if (fixture) {
          invalidate();
          saved.overrides = setOutcome(major, saved.overrides, { ...fixture, stageId, winnerId: button.hasAttribute('data-clear') ? null : team ?? null, source: 'edited' });
          persist();
        }
        break;
      }
      case 'apply':
        if (progress?.best) {
          saved.overrides = applyPath(major, saved.overrides, stageId, progress.best.path);
          invalidate();
          persist();
        }
        break;
      case 'weigh':
        oddsModel = oddsModel === 'record' ? 'even' : 'record';
        saveOddsModel(storage, oddsModel);
        break;
      case 'reset':
        invalidate();
        undo = saved.overrides;
        saved.overrides = [];
        persist();
        break;
      case 'undo':
        invalidate();
        saved.overrides = undo ?? [];
        undo = undefined;
        persist();
        break;
    }
  } catch (error) {
    message = error instanceof Error ? error.message : 'Unable to apply that change.';
  }
  render();
});

void start();
