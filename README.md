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

Add an index entry in [majors.json](public/data/majors.json) and a matching payload in `public/data/majors/`. See the [Austin payload](public/data/majors/austin-2025.json) for a complete example. Use stable IDs, event-specific team names and full HTTPS HLTV image URLs. Team initials appear when the remote image fails.

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

The solver reports a proven maximum or a best score found so far with an upper bound. **Continue search** resumes the same search in the current tab.
