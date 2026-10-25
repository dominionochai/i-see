import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runAgent, type AgentDeps } from "../agent/runner";
import { AgentValidationError, type AgentAction, type AgentTarget, type PlannedStep } from "../agent/types";
import { parseAgentAction, parsePlannedStep, parseStepRequest } from "../agent/validate";

const targets: AgentTarget[] = [
  { id: "like-p1", label: "Like Sam's post", kind: "button" },
  { id: "message-input", label: "Message box", kind: "input", value: "" },
];

describe("parseAgentAction", () => {
  it("accepts a click on a visible target", () => {
    assert.deepEqual(parseAgentAction({ type: "click", target: "like-p1" }, targets), { type: "click", target: "like-p1" });
  });
  it("rejects invented targets", () => {
    assert.throws(() => parseAgentAction({ type: "click", target: "launch-missiles" }, targets), AgentValidationError);
  });
  it("only types into inputs", () => {
    assert.throws(() => parseAgentAction({ type: "type", target: "like-p1", text: "hi" }, targets), AgentValidationError);
    assert.deepEqual(parseAgentAction({ type: "type", target: "message-input", text: "  hi \n there " }, targets),
      { type: "type", target: "message-input", text: "hi there" });
  });
  it("rejects empty text, bad directions and unknown types", () => {
    assert.throws(() => parseAgentAction({ type: "type", target: "message-input", text: "  " }, targets));
    assert.throws(() => parseAgentAction({ type: "scroll", direction: "left" }, targets));
    assert.throws(() => parseAgentAction({ type: "teleport" }, targets));
    assert.throws(() => parseAgentAction("click", targets));
  });
  it("defaults done/fail messages", () => {
    assert.deepEqual(parseAgentAction({ type: "done" }, targets), { type: "done", summary: "Finished." });
    assert.deepEqual(parseAgentAction({ type: "fail" }, targets), { type: "fail", reason: "Could not finish." });
  });
});

describe("parsePlannedStep", () => {
  it("clips the thought and validates the action", () => {
    const step = parsePlannedStep({ thought: "x".repeat(500), action: { type: "scroll", direction: "down" } }, targets);
    assert.equal(step.thought.length, 200);
    assert.deepEqual(step.action, { type: "scroll", direction: "down" });
  });
  it("rejects non-objects", () => assert.throws(() => parsePlannedStep(null, targets)));
});

describe("parseStepRequest", () => {
  it("requires a goal and bounds the data", () => {
    assert.throws(() => parseStepRequest({ goal: "  ", targets: [] }), AgentValidationError);
    const request = parseStepRequest({
      goal: "Like Sam's post",
      targets: [...targets, { id: "like-p1", label: "dup", kind: "button" }, { id: "x\n", label: "y".repeat(500), kind: "button" }],
      history: [{ action: { type: "click", target: "tab-feed" }, result: "Clicked." }],
    });
    assert.equal(request.targets.length, 3, "duplicates dropped");
    assert.ok(request.targets.every((target) => target.label.length <= 120));
    assert.equal(request.history.length, 1);
  });
  it("caps oversized lists", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `t${i}`, label: "l", kind: "button" }));
    assert.equal(parseStepRequest({ goal: "g", targets: many }).targets.length, 80);
  });
});

function makeDeps(script: PlannedStep[], overrides: Partial<AgentDeps> = {}) {
  const performed: AgentAction[] = [];
  let index = 0;
  const controller = new AbortController();
  const deps: AgentDeps = {
    observe: () => targets,
    plan: async () => script[Math.min(index++, script.length - 1)],
    perform: async (action) => { performed.push(action); return "ok"; },
    signal: controller.signal,
    ...overrides,
  };
  return { deps, performed, controller };
}

const click = (target: string): PlannedStep => ({ thought: "t", action: { type: "click", target } });
const done: PlannedStep = { thought: "t", action: { type: "done", summary: "All set" } };

describe("runAgent", () => {
  it("performs steps until the planner is done", async () => {
    const { deps, performed } = makeDeps([click("a"), click("b"), done]);
    assert.deepEqual(await runAgent("goal", deps), { status: "done", summary: "All set", steps: 3 });
    assert.equal(performed.length, 2);
  });
  it("reports planner failure", async () => {
    const { deps } = makeDeps([{ thought: "", action: { type: "fail", reason: "nope" } }]);
    assert.deepEqual(await runAgent("goal", deps), { status: "failed", reason: "nope", steps: 1 });
  });
  it("stops when stuck repeating the same action", async () => {
    const { deps, performed } = makeDeps([click("a")]);
    const outcome = await runAgent("goal", deps);
    assert.equal(outcome.status, "failed");
    assert.equal(performed.length, 2, "third identical action is refused");
  });
  it("stops at the step budget", async () => {
    let n = 0;
    const { deps } = makeDeps([], { plan: async () => click(`t${n++}`), maxSteps: 4 });
    assert.deepEqual(await runAgent("goal", deps), { status: "failed", reason: "The agent ran out of steps.", steps: 4 });
  });
  it("turns planner and performer errors into a failed outcome", async () => {
    const planFail = makeDeps([], { plan: async () => { throw new Error("planner down"); } });
    assert.deepEqual(await runAgent("goal", planFail.deps), { status: "failed", reason: "planner down", steps: 1 });
    const actFail = makeDeps([click("a")], { perform: async () => { throw new Error("not on screen"); } });
    assert.deepEqual(await runAgent("goal", actFail.deps), { status: "failed", reason: "not on screen", steps: 1 });
  });
  it("cancels when aborted mid-run", async () => {
    const { deps, controller } = makeDeps([click("a"), click("b"), done], {
      perform: async () => { controller.abort(); return "ok"; },
    });
    assert.equal((await runAgent("goal", deps)).status, "cancelled");
  });
  it("passes history to the planner", async () => {
    const seen: number[] = [];
    const { deps } = makeDeps([click("a"), click("b"), done], {
      plan: (() => { let i = 0; const script = [click("a"), click("b"), done]; return async (request) => { seen.push(request.history.length); return script[i++]; }; })(),
    });
    await runAgent("goal", deps);
    assert.deepEqual(seen, [0, 1, 2]);
  });
});
