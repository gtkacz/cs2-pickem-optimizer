# CS2 Major PickPath

Browse a Major’s Swiss stages, save a pick sheet and find match results that give it the best score. Edit any playable historical matchup or apply a suggested path to see the field and seed order in the next stage.

## Run locally

```sh
npm ci
npm run dev
```

Run `npm run build` to produce the static site in `dist/`. Run `npm run check` and `npm test` for TypeScript and unit checks. For browser coverage, install Chromium with `npx playwright install chromium --only-shell` and run `npm run test:e2e`.

The archive includes the three Swiss stages of Austin 2025 and Budapest 2025. The app opens an eligible incomplete stage when available. For a completed Major it opens the last Swiss stage. To link to a specific stage, use `?major=austin-2025&stage=stage-1`.

## Add a Major

Add an index entry in [majors.json](public/data/majors.json) and a matching payload in `public/data/majors/`. See the [Austin payload](public/data/majors/austin-2025.json) for a complete example. Use stable IDs, event-specific team names, and logos as full HTTPS HLTV image URLs or base64 `data:image/…` URLs. A Major’s optional `logoUrl` may be any HTTPS or base64 image URL. Team initials appear when the remote image fails.

Include each stage’s seeded entrants, Pick’Em slots and threshold. A direct invite names its team. A qualifier slot names the position it takes from the preceding stage’s ranking, with an official team ID for historical playback.

```json
{
  "entrants": [
    { "seed": 1, "source": { "type": "direct", "teamId": "falcons" } },
    { "seed": 9, "source": { "type": "qualifier", "position": 1 }, "officialTeamId": "b8" }
  ],
  "matches": [
    { "id": "match-1", "round": 1, "teamIds": ["falcons", "b8"], "winnerId": "b8" },
    { "id": "match-2", "round": 1, "teamIds": ["faze", "heroic"], "winnerId": null }
  ]
}
```

The example is an excerpt. A stage needs its full field to run. Include announced fixtures with a null winner and omit pairings that are still unknown. Bump the payload’s `revision` when seeds or official results change. The app keeps saved picks and clears scenario edits tied to the previous revision.

Use `major-swiss-v1` only when the event matches the implemented 16-team rules and replay reproduces its official fixtures. Add a new ruleset ID and replay tests for any different pairing or qualification rules. The app displays historical fixtures when simulation is unavailable.

The solver searches every outcome path, ignoring team strength, and runs until it proves the maximum score for your picks. If you pause it, it reports the best score found so far with an upper bound, and **Continue search** resumes the same search in the current tab.

It also reports the share of outcome paths that reach the target, treating every unplayed match as a coin flip. From round 3 onward every path is counted exactly. Earlier rounds have too many paths, so 10,000 paths are sampled with a fixed seed and the same picks always give the same figure.

Turn on **Weigh by current record** to stop treating the teams as equals. Each team gets a strength of (wins + 1) / (losses + 1) from the record it holds when the simulation starts, and a match between strengths *a* and *b* goes to the first team with probability *a* / (*a* + *b*). A team that is 2–0 then beats a 1–1 team 75% of the time and a 0–2 team 90% of the time, so a path that needs 0–2 teams to qualify counts for much less than one that needs 2–0 teams to. Swiss pairs equal records, so the next round is still a coin flip and the weighting shows once records mix in later rounds. It changes nothing before round 1 or in round 5, when every team still playing has the same record. The choice is remembered in your browser and switches the figure without a new search.
