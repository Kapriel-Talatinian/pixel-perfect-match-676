// In-memory incident store. Single-Worker demo — do not use for prod state.
export type IncidentDecision = "go" | "rollback" | "wait" | null;

export type IncidentRecord = {
  id: string;
  to: string;
  from: string;
  brief: string;
  callSid?: string;
  decision: IncidentDecision;
  createdAt: number;
  updatedAt: number;
};

type Store = Map<string, IncidentRecord>;

const g = globalThis as unknown as { __maydayStore?: Store };
if (!g.__maydayStore) g.__maydayStore = new Map();

export const incidentStore: Store = g.__maydayStore;
