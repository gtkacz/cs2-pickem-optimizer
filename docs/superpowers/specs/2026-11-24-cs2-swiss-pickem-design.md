# CS2 Major Pick’Em simulator

## Goal

Fans can enter their picks for a Major’s Swiss stage, see the best score still possible and follow a set of match results that achieves it. They can change a result from a live or archived stage, then see how the change affects later stages in the same Major. Historical results and scenario edits are available side by side within the same stage view.

The first release covers Swiss stages. Stage history comes from versioned static files. Picks and scenario edits are stored in the current browser. Live feeds, accounts, playoffs, and ranking future results by likelihood are outside this release.

## Approach

The selected approach is a static web app with a browser worker. The app loads a lightweight Major index, then fetches the chosen Major on demand. Browser-local simulation fits static hosting and keeps interaction responsive during a search. A solver API could offer more predictable compute across devices, with the tradeoff of per-run requests and a backend to operate. The user selected the browser-worker approach.

Use TypeScript for the application and simulation engine. The builder can choose a small frontend stack, static build tooling and the engine’s internal representation based on bundle size, readability and measured device performance.

## Data to supply

| File | Fields |
| --- | --- |
| `data/majors.json` | Schema version and entries with stable `id`, `name`, `startDate` and `dataPath`. |
| `data/majors/<major-id>.json` | Schema version, Major ID, team directory, ordered stages and optional source links. |
| Team | Stable `id`, Major-specific `name`, and full HTTPS HLTV `logoUrl`. The UI reserves logo space and falls back to initials if the URL is unavailable. |
| Stage | Stable `id`, `name`, optional `predecessorId`, `rulesetId`, and `pickem` with `undefeatedSlots`, `winlessSlots`, `advanceSlots` and `targetCorrect`. Include entry slots and `matches`. |
| Entry slot | `seed`, `source` and optional `officialTeamId`. A direct entrant’s source is `{ "type": "direct", "teamId": "…" }`. A qualifier’s source is `{ "type": "qualifier", "position": 1 }`, with the position referring to the preceding stage’s qualifier order. Supply `officialTeamId` for a historical qualifier once known. |
| Match | Stable `id`, one-based `round`, two `teamIds`, and `winnerId`. Use `null` for an announced match awaiting a result. Optional `seriesScore` is for display. |

Record all available played matches, plus any known unplayed pairings. Omit future pairings that haven’t been announced. Store every team referenced within a Major in its team directory. Keep official qualifiers and their recorded seeds so the archive displays the actual field. The scenario engine can resolve a different field through the same seed slots and the stage’s ruleset.

Each `rulesetId` identifies a supported, versioned definition of round-one pairings, record groups, reseeding, tiebreaks, rematch handling, stage termination, and qualifier ordering as needed by the next stage. Keep the applicable organizer rulebook with the dataset’s sources. Official pairings are authoritative for history. If the rules engine disagrees with an official pairing on unchanged history, keep the official view readable and disable simulation for that stage until the rules profile or data is corrected. Apply the same availability treatment to incomplete prerequisites or unsupported rulesets. Validate shipped data for referential integrity, seeds, result coherence and rule coverage. Seed the archive with at least two verified completed CS2 Majors from public sources, including multiple Swiss stages in each. Select the events during implementation based on the completeness of the results and rulebooks. Further Majors can be added through the same files.

## Open a Major and choose a stage

- If the URL explicitly identifies a valid Major and stage, open them. Otherwise choose the most recent Major by `startDate`.
- Within the Major, an incomplete stage is eligible to open when it has at least one official match result, or when it has zero official results and is Stage 1 or its predecessor is complete. If several qualify, prefer a stage with results, then the earliest in stage order. If none qualify, open the last completed Swiss stage. If the catalog has no usable data, explain what’s missing.
- Determine completion by replaying official results to the stage’s terminal condition, so having winners for every *recorded* match in a partial dataset does not mark it complete. What-if results have no effect on default navigation or official stage status.

## Picks and results

Choose teams for **3–0**, **0–3**, and **3–1 / 3–2**. A team can occupy one slot. Each correct pick scores one point. The categories are exact, so a 3–0 finish scores in the 3–0 category and the advancing category accepts 3–1 or 3–2. Show the selected stage’s slot counts and target. Allow a run with a partial pick sheet and identify the number of picks being scored.

Run the solver from the effective state of the selected stage. Every branch must obey the stage rules and retain fixed results. Return the highest achievable score when proved, the number of picks scored, target status when known, and one reproducible best-scoring path of remaining matches grouped by round. Label that path as one way to reach the score. Leave a win unlabelled as mandatory unless the solver has established that it is required across the relevant paths. A completed stage with all results fixed has a single final score and no remaining match path.

Use a search that can prove optimality and can report a lower bound from the best valid path found and an upper bound for unexplored branches. Use exact search where practical, including early termination if the best valid path reaches the proven upper bound. If a run is stopped or hits its interactive compute budget, label the score **Best found** and show the upper bound when available. Offer **Continue search** on an unchanged input to resume the retained search frontier. A pick or scenario change invalidates the frontier. Discard stale worker messages after a newer run, pick edit or stage change. The builder owns the pruning implementation and interactive budget, informed by a full Stage 1 fixture on desktop and mobile.

## What-if replays

- Start each scenario from official data. A user can change the winner of an officially completed match, set a winner in an unresolved match, or clear a winner to reopen a match. Label official, edited and simulated outcomes where they appear. Show the official winner beside a changed official result.
- Rebuild pairings after the affected round. Keep unaffected fixtures and results in that round. On a divergent branch, generated later rounds start unresolved. Key scenario overrides by stage, round and effective pairing, and drop stale downstream overrides when an earlier edit invalidates their history. Keep user picks by team ID even if an edit makes a team ineligible.
- A fully resolved stage produces an ordered list of qualifiers. Rebuild the next stage from those qualifiers and its direct entrants. When the next stage’s starting field or seeds change, regenerate its pairings and clear downstream recorded and scenario results from the diverging stage. Continue propagating as each subsequent stage resolves. If the incoming seed-to-team mapping matches the original, keep compatible official fixtures and results. While a predecessor remains unresolved, show the official later stage for reference and identify that the scenario field is pending.
- Present **Apply this path** on a valid solver result. It fills the unresolved matches in the current stage with the displayed outcomes and carries the resulting qualifiers forward. The user can open the next stage and run it with its own picks. Each run optimizes the selected stage’s picks.
- If a saved pick’s team no longer qualifies for the stage, keep it visible, mark it **Didn’t qualify in this scenario**, and allow replacement. Count it as incorrect when scoring the affected stage. Offer **Reset to official results** with Undo and keep the saved pick sheet. Treat official data as read-only input. Persist browser picks and scenario edits by Major and stage, with enough data versioning to detect and revalidate edits against a changed dataset.

## Interface direction

Use the Swiss match sheet as the visual model. Team logos, seeds, records and results carry the identity. Take the compact, content-first dark hierarchy from [SPOTIFY_DESIGN.md](../../../SPOTIFY_DESIGN.md), and the teal-tinted surfaces, spacing rhythm and flat panel treatment from [MONGO_DESIGN.md](../../../MONGO_DESIGN.md). The Major and stage should be immediately visible.

Use a dark teal-charcoal canvas (`#111817`), panels (`#1a2422`), and a raised treatment (`#283633`). Use off-white (`#eef5f2`) for primary text and silver-green (`#a8bbb4`) for secondary text. Give the current primary action, such as **Run simulation**, a mint pill (`#70e1ab`) with dark text (`#10201a`). Keep stage pills and score figures neutral so the team logos carry most of the remaining color. Use semantic tokens and explicit text labels for match state. Use 12px panel radii, quieter rules between rows, and a 4px spacing scale with 8px as the main increment. Use a system sans-serif stack with tabular figures, sentence-case controls and a visible focus ring. Use shadows sparingly on floating menus or dialogs.

Keep the stage selector, pick sheet and results in the same workspace. On desktop, give the Swiss bracket the available width, with one column per round and a compact pick summary and score above it. Group matchups by the teams’ incoming win–loss record. Place qualification and elimination groups in the round where those outcomes are decided. Display team names, logos and seeds in the matchup, and reveal result details and editing actions at the matchup. Show one effective outcome path at a time so the board remains readable. On narrower viewports where five readable columns cannot fit, use the pick sheet followed by the results and round disclosures. Both layouts draw from the same stage state. Team selection, result editing and navigation must work by keyboard and touch. Give controls visible focus, announce solver updates, and keep status legible without color. Provide immediate selection feedback, brief optional transitions for infrequent disclosures, and a reduced-motion treatment. Use team logos as the functional imagery.

## Verification

- Replay archived rounds and verify fixtures, final records, qualifier order and scores against the selected Major’s official sources. Exercise round-one pairing, record grouping, reseeding, ties and rematch rules represented in the dataset.
- Exercise all stage-default cases, including an untouched later stage with completed and incomplete predecessors, partially entered official results, and a fully completed Major.
- Compare solver results against exhaustive enumeration on a small fixture. Verify a completed stage, partial picks, an impossible target, tied optimal paths, interrupted searches and stale responses. Replay every returned match path through the same rules engine to verify its score.
- Flip an early result, resolve the changed stage and verify that qualifiers, seeds, pairings and ineligible picks update downstream. Confirm that undo and reset return to the expected picks and results.
- Inspect the production build at phone, tablet and desktop widths, including 320px and 200% zoom. Keyboard-test picking and edits, measure rendered contrast, test reduced motion and logo failure, and profile a full-stage search on a representative mobile viewport with CPU throttling.
