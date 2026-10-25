import { runAgent, type AgentEvent } from "@/lib/agent/runner";
import { AGENT_LIMITS, type AgentAction, type AgentStepRequest, type AgentTarget, type PlannedStep } from "@/lib/agent/types";
import { cleanText } from "@/lib/agent/validate";
import { BadRequestError, ConflictError } from "./errors";

/** A browser the agent can look at and act in. */
export interface BrowserDriver {
  observe(): Promise<AgentTarget[]>;
  perform(action: AgentAction): Promise<string>;
  close(): Promise<void>;
}

export type RunStatus = "starting" | "running" | "done" | "failed" | "cancelled";

/** What the client polls. */
export interface RunSnapshot {
  id: string;
  goal: string;
  status: RunStatus;
  step: number;
  /** The agent's latest thought or the final outcome. */
  message: string;
  log: string[];
}

export interface BrowserAgentDeps {
  createDriver: (baseUrl: string) => Promise<BrowserDriver>;
  plan: (request: AgentStepRequest) => Promise<PlannedStep>;
  /** How long the finished browser stays open so the result can be seen. */
  closeDelayMs?: number;
  /** Pause after each action so the page can react before the next look. */
  settleMs?: number;
  /** Number of finished runs kept for polling. */
  keepRuns?: number;
}

const FINISHED: ReadonlySet<RunStatus> = new Set(["done", "failed", "cancelled"]);
const MAX_LOG_LINES = 40;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Run {
  snapshot: RunSnapshot;
  controller: AbortController;
  driver: BrowserDriver | null;
}

/**
 * Runs one agent at a time in a real browser and keeps a short history for
 * the client to poll. The browser and the planner are injected so the logic
 * can be tested without either.
 */
export class BrowserAgentRuns {
  private readonly runs = new Map<string, Run>();
  private counter = 0;

  constructor(private readonly deps: BrowserAgentDeps) {}

  /** Starts a run and returns immediately; poll {@link get} for progress. */
  start(goal: unknown, baseUrl: string): RunSnapshot {
    const cleaned = cleanText(goal, AGENT_LIMITS.goalChars);
    if (!cleaned) throw new BadRequestError('"goal" must be a non-empty string.');
    if ([...this.runs.values()].some((run) => !FINISHED.has(run.snapshot.status))) {
      throw new ConflictError("An agent is already running. Wait for it to finish or stop it.");
    }

    this.counter += 1;
    const run: Run = {
      snapshot: { id: `run-${this.counter}`, goal: cleaned, status: "starting", step: 0, message: "Opening a browser…", log: [] },
      controller: new AbortController(),
      driver: null,
    };
    this.runs.set(run.snapshot.id, run);
    this.prune();
    void this.execute(run, baseUrl);
    return { ...run.snapshot };
  }

  get(id: string): RunSnapshot | undefined {
    const run = this.runs.get(id);
    return run && { ...run.snapshot, log: [...run.snapshot.log] };
  }

  /** Stops a run and closes its browser. Returns false for an unknown run. */
  cancel(id: string): boolean {
    const run = this.runs.get(id);
    if (!run) return false;
    run.controller.abort();
    void run.driver?.close().catch(() => undefined);
    return true;
  }

  private async execute(run: Run, baseUrl: string) {
    const { snapshot, controller } = run;
    const log = (line: string) => {
      snapshot.log.push(line);
      if (snapshot.log.length > MAX_LOG_LINES) snapshot.log.shift();
    };
    const finish = (status: RunStatus, message: string) => {
      snapshot.status = status;
      snapshot.message = message;
      log(message);
    };

    try {
      run.driver = await this.deps.createDriver(baseUrl);
      if (controller.signal.aborted) {
        finish("cancelled", "Stopped.");
        return;
      }
      snapshot.status = "running";
      snapshot.message = "Looking at the page…";

      const driver = run.driver;
      const onEvent = (event: AgentEvent) => {
        if (event.type === "plan") {
          snapshot.step = event.step;
          snapshot.message = event.thought || "Working on it…";
          log(`Step ${event.step}: ${event.thought} → ${JSON.stringify(event.action)}`);
        } else if (event.type === "result") {
          log(event.result);
        }
      };

      const outcome = await runAgent(snapshot.goal, {
        observe: () => driver.observe(),
        plan: (request) => this.deps.plan(request),
        perform: (action) => driver.perform(action),
        signal: controller.signal,
        onEvent,
        settle: () => sleep(this.deps.settleMs ?? 500),
      });
      if (outcome.status === "done") finish("done", outcome.summary);
      else if (outcome.status === "failed") finish("failed", outcome.reason);
      else finish("cancelled", "Stopped.");
    } catch (error) {
      finish(controller.signal.aborted ? "cancelled" : "failed", error instanceof Error ? error.message : "The agent hit an error.");
    } finally {
      // Leave the finished page up briefly, then close the browser.
      const driver = run.driver;
      if (driver) {
        if (!controller.signal.aborted) await sleep(this.deps.closeDelayMs ?? 4000);
        await driver.close().catch(() => undefined);
      }
    }
  }

  private prune() {
    const keep = this.deps.keepRuns ?? 5;
    const finished = [...this.runs.entries()].filter(([, run]) => FINISHED.has(run.snapshot.status));
    for (const [id] of finished.slice(0, Math.max(0, finished.length - keep))) this.runs.delete(id);
  }
}
