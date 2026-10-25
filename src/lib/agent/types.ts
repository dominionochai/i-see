/** What the on-screen agent can do. Deliberately tiny: it can only drive Iris's own UI. */
export type AgentAction =
  | { type: "click"; target: string }
  | { type: "type"; target: string; text: string }
  | { type: "scroll"; direction: "up" | "down" }
  | { type: "done"; summary: string }
  | { type: "fail"; reason: string };

/** An element the agent can see, as reported by the page. */
export interface AgentTarget {
  id: string;
  label: string;
  kind: "button" | "input";
  /** Current value of an input. */
  value?: string;
}

export interface AgentHistoryEntry {
  action: AgentAction;
  result: string;
}

export interface PlannedStep {
  thought: string;
  action: AgentAction;
}

export interface AgentStepRequest {
  goal: string;
  history: AgentHistoryEntry[];
  targets: AgentTarget[];
}

export const AGENT_LIMITS = {
  goalChars: 300,
  textChars: 280,
  labelChars: 120,
  thoughtChars: 200,
  maxTargets: 80,
  maxHistory: 20,
  maxSteps: 14,
} as const;

export class AgentValidationError extends Error {}
