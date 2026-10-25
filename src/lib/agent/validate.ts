import {
  AGENT_LIMITS,
  AgentValidationError,
  type AgentAction,
  type AgentHistoryEntry,
  type AgentStepRequest,
  type AgentTarget,
  type PlannedStep,
} from "./types";

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Collapses whitespace/control characters and truncates, so model- and page-supplied text stays one tidy line. */
export function cleanText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function requireString(source: Json, key: string, maxChars: number): string {
  const value = cleanText(source[key], maxChars);
  if (!value) throw new AgentValidationError(`"${key}" must be a non-empty string.`);
  return value;
}

function parseTargets(raw: unknown): AgentTarget[] {
  if (!Array.isArray(raw)) throw new AgentValidationError('"targets" must be an array.');
  const seen = new Set<string>();
  const targets: AgentTarget[] = [];
  for (const item of raw.slice(0, AGENT_LIMITS.maxTargets)) {
    if (!isObject(item)) continue;
    const id = cleanText(item.id, 80);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const kind = item.kind === "input" ? "input" : "button";
    const target: AgentTarget = { id, label: cleanText(item.label, AGENT_LIMITS.labelChars), kind };
    if (kind === "input" && typeof item.value === "string") target.value = cleanText(item.value, AGENT_LIMITS.textChars);
    targets.push(target);
  }
  return targets;
}

/** Validates one action against the targets that are actually on screen. */
export function parseAgentAction(raw: unknown, targets: readonly AgentTarget[]): AgentAction {
  if (!isObject(raw)) throw new AgentValidationError("Action must be an object.");
  const byId = new Map(targets.map((target) => [target.id, target]));

  switch (raw.type) {
    case "click": {
      const target = requireString(raw, "target", 80);
      if (!byId.has(target)) throw new AgentValidationError(`Unknown target "${target}".`);
      return { type: "click", target };
    }
    case "type": {
      const target = requireString(raw, "target", 80);
      if (byId.get(target)?.kind !== "input") throw new AgentValidationError(`"${target}" is not a text field.`);
      return { type: "type", target, text: requireString(raw, "text", AGENT_LIMITS.textChars) };
    }
    case "scroll":
      if (raw.direction !== "up" && raw.direction !== "down") {
        throw new AgentValidationError('"direction" must be "up" or "down".');
      }
      return { type: "scroll", direction: raw.direction };
    case "done":
      return { type: "done", summary: cleanText(raw.summary, AGENT_LIMITS.thoughtChars) || "Finished." };
    case "fail":
      return { type: "fail", reason: cleanText(raw.reason, AGENT_LIMITS.thoughtChars) || "Could not finish." };
    default:
      throw new AgentValidationError("Unknown action type.");
  }
}

/** Validates the model's `{ thought, action }` reply. */
export function parsePlannedStep(raw: unknown, targets: readonly AgentTarget[]): PlannedStep {
  if (!isObject(raw)) throw new AgentValidationError("Reply must be a JSON object.");
  return {
    thought: cleanText(raw.thought, AGENT_LIMITS.thoughtChars),
    action: parseAgentAction(raw.action, targets),
  };
}

/** Validates and bounds an incoming `/api/agent/step` request body. */
export function parseStepRequest(raw: unknown): AgentStepRequest {
  if (!isObject(raw)) throw new AgentValidationError("Body must be a JSON object.");
  const goal = requireString(raw, "goal", AGENT_LIMITS.goalChars);
  const targets = parseTargets(raw.targets);

  const history: AgentHistoryEntry[] = [];
  if (raw.history !== undefined) {
    if (!Array.isArray(raw.history)) throw new AgentValidationError('"history" must be an array.');
    for (const entry of raw.history.slice(-AGENT_LIMITS.maxHistory)) {
      if (!isObject(entry)) continue;
      // History actions were already executed; accept any well-formed shape without target checks.
      const action = parseAgentAction(entry.action, [
        ...targets,
        ...(isObject(entry.action) && typeof entry.action.target === "string"
          ? [{ id: entry.action.target, label: "", kind: entry.action.type === "type" ? ("input" as const) : ("button" as const) }]
          : []),
      ]);
      history.push({ action, result: cleanText(entry.result, AGENT_LIMITS.labelChars) });
    }
  }
  return { goal, history, targets };
}
