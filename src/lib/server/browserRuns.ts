import { BrowserAgentRuns } from "./browserAgent";
import { planStep } from "./agentPlanner";
import { createPlaywrightDriver } from "./playwrightDriver";

// Kept on globalThis so dev-server hot reloads don't orphan a running agent.
const holder = globalThis as typeof globalThis & { __irisBrowserRuns?: BrowserAgentRuns };

export function getBrowserRuns(): BrowserAgentRuns {
  return (holder.__irisBrowserRuns ??= new BrowserAgentRuns({ createDriver: createPlaywrightDriver, plan: planStep }));
}

/** Replaces the shared manager (used by tests). */
export function setBrowserRuns(runs: BrowserAgentRuns | undefined) {
  holder.__irisBrowserRuns = runs;
}
