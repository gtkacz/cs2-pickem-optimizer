# CS2 Major Pick’Em Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive CS2 Major Pick’Em app that finds a best-scoring Swiss path and carries replayed qualifiers into subsequent stages.

**Architecture:** A static site loads a catalog and fetches each Major on demand. The main thread renders one shared stage model across the desktop bracket and mobile round list. A browser worker owns an interruptible search that shares the rules engine with historical replay.

**Tech Stack:** TypeScript, Vite, native HTML and CSS, Web Workers, localStorage, Vitest, and Playwright.

**Spec:** [CS2 Major Pick’Em simulator](../specs/2026-11-24-cs2-swiss-pickem-design.md)

## Global Constraints

- Scope covers Swiss stages, including at least two verified completed CS2 Majors with multiple Swiss stages.
- Team artwork is loaded from full HTTPS HLTV URLs. Use initials if an image is unavailable.
- Official fixtures and results are the baseline. Preserve them and keep picks and what-if data browser-local.
- Score exact 3–0, 0–3, and 3–1 / 3–2 picks. Use the stage’s configured slot counts and threshold.
- Report a maximum only after proving it. Offer a continuation of the same search when a budget expires.
- Keep the desktop bracket grouped by round and incoming record. Use the same state for the phone pick sheet and expandable round list.
- Follow the spec’s teal-charcoal palette, single mint action, pill controls and flat panels, informed by `SPOTIFY_DESIGN.md` and `MONGO_DESIGN.md`.
- Use `rtk` for shell commands. Record each verified task as a separate commit where writable Git metadata is available. At plan time this workspace did not report as an initialized Git repository. Track completed tasks here if commits are unavailable.

## Review Focus

- A dataset can contain winners for all listed matches and still be incomplete. Check the terminal condition in Task 2.
- A newer Major can have future stages whose entrants are TBD. Check that navigation cannot mistake an unresolved predecessor for a complete one in Task 2.
- A historical correction can change seeding without changing the set of qualifiers. Check seed-to-team mappings and downstream invalidation in Task 3.
- A worker response can arrive after the user changes a pick or switches stages. Check request identity in Task 4.
- A dataset update can make saved scenario edits incompatible without making saved picks useless. Check recovery in Task 5.

---

## File map

| Area | Paths | Responsibility |
| --- | --- | --- |
| Build and checks | `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `index.html` | Static build, unit tests, browser tests and entry HTML |
| Archive | `public/data/majors.json`, `public/data/majors/<major-id>.json`, `src/data/types.ts`, `src/data/archive.ts` | Versioned JSON, validation, fetching and in-browser cache |
| Rules | `src/swiss/rules.ts`, `src/swiss/stage.ts` | Versioned pairing and qualifier policies, snapshots and official replay |
| Scenario | `src/swiss/scenario.ts` | What-if overrides, same-round retention and propagation to later stages |
| Search | `src/solver/search.ts`, `src/solver/solver.worker.ts`, `src/solver/client.ts` | Scoring, search frontier and typed worker communication |
| Interface | `src/main.ts`, `src/ui/state.ts`, `src/ui/picks.ts`, `src/ui/bracket.ts`, `src/ui/styles.css` | App shell, persistence, pick controls, both stage layouts and visual tokens |

### Task 1: Load and validate the Major archive format

**Files:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/data/types.ts`, `src/data/archive.ts`, `tests/archive.test.ts`, `tests/fixtures/archive.ts`.

**Interfaces:** Define `MajorIndex`, `MajorIndexEntry`, `Major`, `Team`, `Stage`, `EntrySlot`, and `RecordedMatch` with the spec’s fields. Major payloads also have `revision: string`, bumped when official inputs change. Export `parseMajorIndex(input: unknown): MajorIndex`, `parseMajor(input: unknown, expectedId: string): Major` and `createArchive(baseUrl: URL, fetcher?: typeof fetch): { loadIndex(): Promise<MajorIndex>; loadMajor(entry: MajorIndexEntry): Promise<Major> }`.

- [ ] Add minimal Vite, TypeScript and Vitest setup with `dev`, `test`, `check` and `build` scripts. Keep runtime dependencies empty for the initial implementation.
- [ ] Write `tests/archive.test.ts` to assert the parsers preserve pending winners and qualifier slots, reject duplicate seeds, unknown teams, winners outside the fixture, cyclic or forward predecessors and unsafe paths, and make a single fetch for simultaneous reads. Simulate a rejected request and assert a retry succeeds.
- [ ] Run `rtk npm test -- tests/archive.test.ts` and confirm it fails on the missing archive module.
- [ ] Implement the parsers and same-origin loader in `src/data/archive.ts`. Resolve data paths against Vite’s base URL. Retain completed and in-flight loads and remove rejected promises from the cache. Validate external logos separately from archive paths.
- [ ] Run `rtk npm test -- tests/archive.test.ts`. Expect all archive tests to pass. Record the archive contract checkpoint.

### Task 2: Replay historical Swiss rounds and pick a default stage

**Files:** `src/swiss/rules.ts`, `src/swiss/stage.ts`, `public/data/majors.json`, the two Major payloads under `public/data/majors/`, `tests/stage.test.ts`, `tests/history.test.ts`.

**Interfaces:** Export `resolveRules(id: string): SwissRules | undefined` from `rules.ts`. Rules expose `pairRound(state: StageState): Fixture[]`, `rankQualifiers(state: StageState): string[]`, and terminal thresholds. From `stage.ts`, export `startStage(stage: Stage, entrants: SeededTeam[], rules: SwissRules): StageState`, `applyRound(state: StageState, outcomes: MatchOutcome[], rules: SwissRules): StageState`, `officialStage(major: Major, stageId: string): OfficialStage`, and `defaultStage(major: Major): Stage | undefined`. `StageState` carries entrants by seed, round number, team records, opponent history and completed rounds. `Fixture` carries round and two team IDs. `MatchOutcome` adds `winnerId`. `OfficialStage` carries replayed rounds, pending fixtures, completion and an availability reason when replay is blocked.

- [ ] Select two completed CS2 Majors with accessible organizer rules and reliable published seeds, match results and stage advancement. Record sources in each payload and pin distinct profiles wherever the events’ rules differ. Keep historical team identity and logo references in each Major payload.
- [ ] Write `tests/stage.test.ts`. Check that no-results Stage 1 is eligible, a stage with some results takes precedence, an untouched successor requires a complete predecessor, a partial archive with every listed winner stays incomplete, and a completed Major falls back to its last Swiss stage.
- [ ] Write `tests/history.test.ts`. Assert each shipped stage reproduces its real fixtures, terminal records and incoming qualifier-to-seed assignments. Assert a conflicting official fixture stays visible and marks simulation unavailable. Include targeted fixtures for rematch handling and a tiebreak that changes pairing order.
- [ ] Run `rtk npm test -- tests/stage.test.ts tests/history.test.ts`. Expect new tests to fail before the engine is implemented.
- [ ] Implement pairing and replay from documented rules, including round-one pairing, same-record groups, tiebreak ordering, rematch avoidance, early qualification and elimination, and the order used to seed qualifiers into the next stage. Match historical pairings by unordered team IDs. Keep archived display data available when replay cannot validate a stage.
- [ ] Run both test files again. Expect all supported archive stages to reproduce their published fixture histories and advancement. Record the historical replay checkpoint.

### Task 3: Rebuild the Major from what-if edits

**Files:** `src/swiss/scenario.ts`, `tests/scenario.test.ts`.

**Interfaces:** Consume `officialStage`, `startStage`, `applyRound` and `SwissRules`. Export `buildScenario(major: Major, overrides: readonly ScenarioOverride[]): MajorScenario`, `setOutcome(major: Major, overrides: readonly ScenarioOverride[], change: ScenarioOverride): ScenarioOverride[]`, and `applyPath(major: Major, overrides: readonly ScenarioOverride[], stageId: string, outcomes: readonly MatchOutcome[]): ScenarioOverride[]`. An override carries `stageId`, `round`, unordered `teamIds`, `winnerId: string | null`, and `source: 'edited' | 'simulated'`. A `MajorScenario` exposes each stage’s effective seeded field, completed rounds, unresolved fixtures, qualifier order, scenario availability and valid overrides.

- [ ] Write `tests/scenario.test.ts`. Change a Round 1 result while a sibling remains fixed and assert later fixtures are regenerated. Reopen the same match with `winnerId: null`. Resolve a branch that keeps the same qualifier set but swaps their seeds and assert the next round-one fixtures rebuild and stale overrides are removed. Check identical incoming seed mappings preserve compatible official results, and an unresolved predecessor leaves the successor pending in scenario mode.
- [ ] Run `rtk npm test -- tests/scenario.test.ts`. Expect failure until scenario replay is implemented.
- [ ] Implement `buildScenario`, `setOutcome` and `applyPath`. Revalidate each override against the effective fixtures and previous round before applying it. Keep unaffected official matches in the edited round. Clear downstream outcomes at the divergence and preserve official reference data. Verify an incoming path by replay before making it the effective active scenario.
- [ ] Run `rtk npm test -- tests/scenario.test.ts`. Expect all scenario tests to pass. Record the cascade checkpoint.

### Task 4: Search for the best path in a resumable worker

**Files:** `src/solver/search.ts`, `src/solver/solver.worker.ts`, `src/solver/client.ts`, `tests/search.test.ts`, `tests/solver-client.test.ts`.

**Interfaces:** Export `PickCategory = 'undefeated' | 'winless' | 'advance'`, `type Pick = { teamId: string; category: PickCategory }`, `scorePicks(state: StageState, picks: readonly Pick[]): number` and `createSearch(input: SearchInput): SearchSession`. `SearchInput` is serializable and contains `rulesetId`, current snapshot, fixed pending-round outcomes and picks. `SearchSession.step(maxNodes: number): SearchProgress` returns `{ best: { score: number; path: MatchOutcome[] } | null; upperBound: number; optimal: boolean }`. Export `createSolverClient(worker: Worker): SolverClient` with typed `start`, `pause`, `continue`, and `cancel` controls. Requests and responses carry a run ID.

- [ ] Write `tests/search.test.ts`. Compare the search with exhaustive enumeration on a small rules fixture and replay its witness. Check fixed winners, category boundaries, partial picks, a stage with no remaining fixtures, an impossible target, tied valid witnesses and `step(1)` followed by completion from the retained frontier. Assert every intermediate result satisfies `best.score <= true maximum <= upperBound` when a witness exists.
- [ ] Write `tests/solver-client.test.ts` with a fake transport. Deliver a result after cancellation and after a newer run starts. Assert neither stale response updates active progress. Verify pause and continuation preserve the run ID.
- [ ] Run `rtk npm test -- tests/search.test.ts tests/solver-client.test.ts`. Expect failure for missing search and transport modules.
- [ ] Implement exact scoring and branch-and-bound over legal round outcomes, respecting pending fixed results. Bound each branch by picks whose terminal category is individually still reachable and prune only when that bound cannot beat the current witness. Establish a valid early witness, use deterministic branch order, and retain pending nodes across chunks. Prove optimality once the witness reaches the largest remaining bound or the frontier is exhausted. Yield between bounded chunks so worker controls can interrupt it.
- [ ] Run both tests again, then time a representative archived Stage 1 with early results cleared and record the witness, proof or remaining bound. Record the worker checkpoint.

### Task 5: Build the desktop bracket and phone workflow

**Files:** `package.json`, `src/main.ts`, `src/ui/state.ts`, `src/ui/picks.ts`, `src/ui/bracket.ts`, `src/ui/styles.css`, `tests/ui-state.test.ts`, `playwright.config.ts`, `tests/e2e/pickem.spec.ts`.

**Interfaces:** Export `loadSavedMajor(storage: Storage, major: Major): SavedMajor` and `saveMajor(storage: Storage, major: Major, state: SavedMajor): boolean` from `ui/state.ts`. `SavedMajor` holds `picksByStage` and valid scenario overrides. Export `mountPicks(root: HTMLElement, model: PickSheetModel, actions: PickActions): void` and `mountStage(root: HTMLElement, model: StageViewModel, actions: StageActions): void`; keep UI models derived from the task 2–4 outputs in `main.ts`.

- [ ] Write `tests/ui-state.test.ts`. Supply stale revision data with an impossible override and a valid prior pick, corrupt JSON and throwing storage methods. Assert revalidation or a clean in-memory state as appropriate and preserve historically selected team IDs so they can be marked ineligible. Test that a team cannot occupy two pick slots.
- [ ] Configure Playwright to build and serve Vite’s production output, with `test:e2e` mapped to `playwright test`.
- [ ] Write `tests/e2e/pickem.spec.ts`. In a completed archive stage, select picks, run and check the fixed official score. Edit a historical result, apply a simulated path, open the successor and assert its updated field is visible. Reset, undo and restore the altered stage. At phone width, verify round disclosures and keyboard selection. Abort a logo image request and assert the initials fallback.
- [ ] Run `rtk npm test -- tests/ui-state.test.ts` and `rtk npm run test:e2e`. Expect failures until state and interface are wired to the archive and worker.
- [ ] Implement the archive selector, deep links, stage navigation, picks, run and continuation controls, what-if labels, inline editing, reset with Undo, and recoverable archive and solver errors in the normal app entry point. Use one stage view model for a five-column desktop bracket and the responsive list. Keep meaningful labels, keyboard focus, accessible updates, stable logo dimensions, tabular figures and restrained reduced-motion transitions.
- [ ] Run `rtk npm run check`, `rtk npm test`, `rtk npm run build` and `rtk npm run test:e2e` against the production preview. Expect clean type checks, unit tests, build and browser scenarios. Record the interface checkpoint.

### Task 6: Verify the final product and document the data handoff

**Files:** `README.md`, `tests/e2e/pickem.spec.ts` if a regression needs pinning.

**Interfaces:** Use the production build and the sample Major payloads as the runnable examples for maintainers.

- [ ] Write the README with install, run, build and verification commands. Include a minimal worked example showing a team’s HLTV URL, a direct slot, an inherited qualifier slot, a finished match and an announced match. Explain dataset revision bumps and how to add a supported ruleset without changing old replays.
- [ ] Use the dark bracket mockup and the spec’s palette as the visual reference. Inspect production at 1440px, 768px, 390px, 320px and 200% browser zoom. Confirm visible focus, touch controls, readable long team names, no page-level horizontal overflow, a useful no-results state and recovery from a broken archive fetch. Measure actual text, control and focus color pairs. Inspect reduced motion.
- [ ] Profile a full Stage 1 search under mobile CPU throttling with the production bundle. Verify that controls respond while the solver runs, interruption and continuation work, and the reported witness is replayable. Record solver bounds and browser conditions with any measurements.
- [ ] Run `rtk npm run check`, `rtk npm test`, `rtk npm run build` and `rtk npm run test:e2e` after fixes. Report exact checks run, archive coverage and any unavailable browser checks or outstanding performance limits. Record the release verification checkpoint.
