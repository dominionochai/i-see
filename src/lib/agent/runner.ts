import {
  AGENT_LIMITS,
  type AgentAction,
  type AgentHistoryEntry,
  type AgentStepRequest,
  type AgentTarget,
  type PlannedStep,
} from "./types";

export type AgentEvent =
  | { type: "observe"; step: number; targets: AgentTarget[] }
  | { type: "plan"; step: number; thought: string; action: AgentAction }
  | { type: "result"; step: number; result: string };

export type AgentOutcome =
  | { status: "done"; summary: string; steps: number }
  | { status: "failed"; reason: string; steps: number }
  | { status: "cancelled"; steps: number };

export interface AgentDeps {
  /** Lists what is currently on screen. */
  observe: () => AgentTarget[] | Promise<AgentTarget[]>;
  /** Asks the planner for the next step. */
  plan: (request: AgentStepRequest, signal: AbortSignal) => Promise<PlannedStep>;
  /** Carries the action out on screen and describes what happened. */
  perform: (action: AgentAction, signal: AbortSignal) => Promise<string>;
  signal: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
  maxSteps?: number;
  /** Pause after each action so the screen can settle before the next observation. */
  settle?: () => Promise<void>;
}

/** The same action three times in a row means the agent is stuck. */
const REPEAT_LIMIT = 3;

const sameAction = (a: AgentAction, b: AgentAction) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Observe → plan → act loop. Stops when the planner says done/fail, when the step
 * budget is spent, when the same action repeats, or when `signal` aborts.
 * Planner and performer errors become a failed outcome rather than escaping.
 */
export async function runAgent(goal: string, deps: AgentDeps): Promise<AgentOutcome> {
  const { signal, onEvent, maxSteps = AGENT_LIMITS.maxSteps } = deps;
  const history: AgentHistoryEntry[] = [];
  let steps = 0;
  let repeats = 0;

  try {
    while (steps < maxSteps) {
      if (signal.aborted) return { status: "cancelled", steps };
      steps += 1;

      const targets = await deps.observe();
      onEvent?.({ type: "observe", step: steps, targets });

      // Hand the planner a snapshot: the live array keeps growing as the run proceeds.
      const planned = await deps.plan({ goal, history: [...history], targets }, signal);
      if (signal.aborted) return { status: "cancelled", steps };
      onEvent?.({ type: "plan", step: steps, thought: planned.thought, action: planned.action });

      const { action } = planned;
      if (action.type === "done") return { status: "done", summary: action.summary, steps };
      if (action.type === "fail") return { status: "failed", reason: action.reason, steps };

      const previous = history[history.length - 1]?.action;
      repeats = previous && sameAction(previous, action) ? repeats + 1 : 1;
      if (repeats >= REPEAT_LIMIT) {
        return { status: "failed", reason: "The agent got stuck repeating itself.", steps };
      }

      const result = await deps.perform(action, signal);
      history.push({ action, result });
      onEvent?.({ type: "result", step: steps, result });
      await deps.settle?.();
    }
    return { status: "failed", reason: "The agent ran out of steps.", steps };
  } catch (error) {
    if (signal.aborted) return { status: "cancelled", steps };
    return { status: "failed", reason: error instanceof Error ? error.message : "The agent hit an error.", steps };
  }
}
