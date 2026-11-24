export type TeamPair = [string, string];
export type Team = { id: string; name: string; logoUrl: string };
export type MajorIndexEntry = { id: string; name: string; startDate: string; dataPath: string };
export type MajorIndex = { schemaVersion: 1; majors: MajorIndexEntry[] };
export type EntrySlot = {
  seed: number;
  source: { type: 'direct'; teamId: string } | { type: 'qualifier'; position: number };
  officialTeamId?: string;
};
export type RecordedMatch = {
  id: string; round: number; teamIds: TeamPair; winnerId: string | null; seriesScore?: [number, number];
};
export type PickRules = { undefeatedSlots: number; winlessSlots: number; advanceSlots: number; targetCorrect: number };
export type Stage = {
  id: string; name: string; predecessorId?: string; rulesetId: string;
  pickem: PickRules; entrants: EntrySlot[]; matches: RecordedMatch[];
};
export type Major = { schemaVersion: 1; id: string; revision: string; teams: Team[]; stages: Stage[]; sources?: string[] };
