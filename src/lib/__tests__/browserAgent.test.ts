import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { DELETE, GET, POST } from "@/app/api/agent/browser/route";
import type { AgentAction, AgentStepRequest, AgentTarget, PlannedStep } from "@/lib/agent/types";
import { BrowserAgentRuns, type BrowserAgentDeps, type BrowserDriver, type RunSnapshot } from "@/lib/server/browserAgent";
import { BadRequestError, ConflictError } from "@/lib/server/errors";
import { setBrowserRuns } from "@/lib/server/browserRuns";
import { agentSelector } from "@/lib/server/playwrightDriver";

const TARGETS: AgentTarget[] = [
  { id: "tab-messages", label: "Open the Messages tab", kind: "button" },
  { id: "message-input", label: "Message text box", kind: "input", value: "" },
  { id: "message-send", label: "Send the message", kind: "button" },
];

/** A browser that records what it was asked to do. */
class FakeDriver implements BrowserDriver {
  performed: AgentAction[] = [];
  closed = false;
  async observe() { return TARGETS; }
  async perform(action: AgentAction) { this.performed.push(action); return `did ${action.type}`; }
  async close() { this.closed = true; }
}

const click = (target: string): PlannedStep => ({ thought: `press ${target}`, action: { type: "click", target } });
const done: PlannedStep = { thought: "finished", action: { type: "done", summary: "Message sent to Maya." } };

function scripted(steps: PlannedStep[]) {
  let index = 0;
  const requests: AgentStepRequest[] = [];
  return { requests, plan: async (request: AgentStepRequest) => { requests.push(request); return steps[Math.min(index++, steps.length - 1)]; } };
}

function makeRuns(overrides: Partial<BrowserAgentDeps> = {}) {
  const driver = new FakeDriver();
  const planner = scripted([click("tab-messages"), { thought: "type", action: { type: "type", target: "message-input", text: "Feeling better" } }, click("message-send"), done]);
  const runs = new BrowserAgentRuns({ createDriver: async () => driver, plan: planner.plan, closeDelayMs: 0, settleMs: 0, ...overrides });
  return { runs, driver, planner };
}

/** Polls until the run reaches a final state. */
async function finished(runs: BrowserAgentRuns, id: string): Promise<RunSnapshot> {
  for (let i = 0; i < 200; i += 1) {
    const snapshot = runs.get(id)!;
    if (["done", "failed", "cancelled"].includes(snapshot.status)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("run did not finish");
}

describe("BrowserAgentRuns", () => {
  it("drives the browser through the planned steps and reports the outcome", async () => {
    const { runs, driver, planner } = makeRuns();
    const started = runs.start("Message Maya that I'm feeling better", "http://localhost:3000");
    assert.equal(started.status, "starting");

    const result = await finished(runs, started.id);
    assert.equal(result.status, "done");
    assert.equal(result.message, "Message sent to Maya.");
    assert.equal(result.step, 4);
    assert.deepEqual(driver.performed.map((action) => action.type), ["click", "type", "click"]);
    assert.ok(result.log.some((line) => line.includes("press tab-messages")));
    assert.equal(planner.requests[0].goal, "Message Maya that I'm feeling better");
    assert.deepEqual(planner.requests[0].targets, TARGETS);
    assert.equal(planner.requests[2].history.length, 2, "the planner is shown what already happened");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(driver.closed, true, "browser is closed afterwards");
  });

  it("refuses a second run while one is active, then allows one after it finishes", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { runs } = makeRuns({ plan: async () => { await gate; return done; } });
    const first = runs.start("first", "http://localhost");
    assert.throws(() => runs.start("second", "http://localhost"), ConflictError);
    release();
    await finished(runs, first.id);
    assert.doesNotThrow(() => runs.start("third", "http://localhost"));
  });

  it("cancels a run, stops further actions and closes the browser", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const driver = new FakeDriver();
    const runs = new BrowserAgentRuns({
      createDriver: async () => driver,
      plan: async () => { await gate; return click("tab-messages"); },
      closeDelayMs: 0,
      settleMs: 0,
    });
    const started = runs.start("goal", "http://localhost");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(runs.cancel(started.id), true);
    release();
    const result = await finished(runs, started.id);
    assert.equal(result.status, "cancelled");
    assert.equal(driver.performed.length, 0);
    assert.equal(driver.closed, true);
    assert.equal(runs.cancel("nope"), false);
  });

  it("reports a failure to open the browser", async () => {
    const { runs } = makeRuns({ createDriver: async () => { throw new Error("Chrome is not installed"); } });
    const started = runs.start("goal", "http://localhost");
    const result = await finished(runs, started.id);
    assert.equal(result.status, "failed");
    assert.match(result.message, /Chrome is not installed/);
  });

  it("reports planner failures and closes the browser", async () => {
    const { runs, driver } = makeRuns({ plan: async () => { throw new Error("planner down"); } });
    const result = await finished(runs, runs.start("goal", "http://localhost").id);
    assert.equal(result.status, "failed");
    assert.equal(result.message, "planner down");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(driver.closed, true);
  });

  it("validates the goal and trims long ones", () => {
    const { runs } = makeRuns();
    assert.throws(() => runs.start("   ", "http://localhost"), BadRequestError);
    assert.throws(() => runs.start(42, "http://localhost"), BadRequestError);
    assert.equal(runs.start("x".repeat(1000), "http://localhost").goal.length, 300);
  });

  it("keeps only the most recent finished runs", async () => {
    const { runs } = makeRuns({ keepRuns: 2 });
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const snapshot = runs.start(`goal ${i}`, "http://localhost");
      ids.push(snapshot.id);
      await finished(runs, snapshot.id);
    }
    assert.equal(runs.get(ids[0]), undefined);
    assert.ok(runs.get(ids[3]));
  });
});

describe("agent selectors", () => {
  it("escapes quotes and backslashes in ids", () => {
    assert.equal(agentSelector("like-p1"), '[data-agent-id="like-p1"]:visible');
    assert.equal(agentSelector('a"b\\c'), '[data-agent-id="a\\"b\\\\c"]:visible');
  });
});

describe("/api/agent/browser", () => {
  const env = { ...process.env };
  beforeEach(() => setBrowserRuns(makeRuns().runs));
  afterEach(() => {
    setBrowserRuns(undefined);
    process.env = { ...env };
  });

  const request = (method: string, query = "", body?: unknown) =>
    new Request(`http://localhost:3000/api/agent/browser${query}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });

  it("starts a run (202), reports progress and lets you stop it", async () => {
    const started = await POST(request("POST", "", { goal: "Like Sam's sunset post" }));
    assert.equal(started.status, 202);
    const { id } = await started.json();
    const progress = await GET(request("GET", `?run=${id}`));
    assert.equal(progress.status, 200);
    assert.equal((await progress.json()).goal, "Like Sam's sunset post");
    assert.equal((await DELETE(request("DELETE", `?run=${id}`))).status, 200);
  });

  it("rejects bad requests and unknown runs", async () => {
    assert.equal((await POST(request("POST", "", { goal: "" }))).status, 400);
    assert.equal((await POST(request("POST", "", "not an object"))).status, 400);
    assert.equal((await GET(request("GET", "?run=missing"))).status, 404);
    assert.equal((await DELETE(request("DELETE", "?run=missing"))).status, 404);
  });

  it("returns 409 while a run is active", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    setBrowserRuns(makeRuns({ plan: async () => { await gate; return done; } }).runs);
    assert.equal((await POST(request("POST", "", { goal: "one" }))).status, 202);
    assert.equal((await POST(request("POST", "", { goal: "two" }))).status, 409);
    release();
  });

  it("is disabled in production unless enabled", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    assert.equal((await POST(request("POST", "", { goal: "x" }))).status, 404);
    assert.equal((await GET(request("GET", "?run=a"))).status, 404);
    assert.equal((await DELETE(request("DELETE", "?run=a"))).status, 404);
    process.env.ENABLE_BROWSER_AGENT = "1";
    assert.equal((await POST(request("POST", "", { goal: "x" }))).status, 202);
  });
});
