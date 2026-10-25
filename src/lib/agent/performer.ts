import type { AgentAction, AgentTarget } from "./types";
import { AGENT_LIMITS } from "./types";

export const AGENT_ID_ATTRIBUTE = "data-agent-id";
export const AGENT_LABEL_ATTRIBUTE = "data-agent-label";
export const AGENT_SCROLL_ATTRIBUTE = "data-agent-scroll";

const TYPE_DELAY_MS = 28;
const AIM_DELAY_MS = 380;
const SCROLL_DELAY_MS = 550;
const SCROLL_FRACTION = 0.7;

/** Visual hooks the performer uses to show what it is doing. */
export interface CursorController {
  moveTo: (x: number, y: number) => Promise<void>;
  pulse: () => void;
}

export interface PerformOptions {
  root?: Document;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isTextField = (element: Element): element is HTMLInputElement | HTMLTextAreaElement =>
  element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;

function isVisible(element: HTMLElement): boolean {
  if (element.getClientRects().length === 0) return false;
  const style = getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none") return false;
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
}

function labelOf(element: HTMLElement): string {
  return (
    element.getAttribute(AGENT_LABEL_ATTRIBUTE) ??
    element.getAttribute("aria-label") ??
    element.textContent ??
    ""
  ).replace(/\s+/g, " ").trim().slice(0, AGENT_LIMITS.labelChars);
}

function findTarget(id: string, root: Document): HTMLElement | null {
  const candidates = root.querySelectorAll<HTMLElement>(`[${AGENT_ID_ATTRIBUTE}]`);
  return Array.from(candidates).find((element) => element.getAttribute(AGENT_ID_ATTRIBUTE) === id && isVisible(element)) ?? null;
}

/** Lists the agent-addressable elements currently visible on screen. */
export function observeTargets(root: Document = document): AgentTarget[] {
  const seen = new Set<string>();
  const targets: AgentTarget[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(`[${AGENT_ID_ATTRIBUTE}]`)) {
    const id = element.getAttribute(AGENT_ID_ATTRIBUTE);
    if (!id || seen.has(id) || !isVisible(element)) continue;
    seen.add(id);
    targets.push(
      isTextField(element)
        ? { id, label: labelOf(element), kind: "input", value: element.value.slice(0, AGENT_LIMITS.textChars) }
        : { id, label: labelOf(element), kind: "button" },
    );
  }
  return targets.slice(0, AGENT_LIMITS.maxTargets);
}

/** Sets a value on a React-controlled field so React sees the change. */
function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function aimAt(element: HTMLElement, cursor: CursorController, sleep: (ms: number) => Promise<void>) {
  element.scrollIntoView({ block: "nearest", inline: "nearest" });
  const rect = element.getBoundingClientRect();
  await cursor.moveTo(rect.left + rect.width / 2, rect.top + rect.height / 2);
  await sleep(AIM_DELAY_MS);
}

/** Carries out one action on screen and returns a short description of what happened. */
export async function performAction(
  action: AgentAction,
  cursor: CursorController,
  { root = document, sleep = defaultSleep }: PerformOptions = {},
): Promise<string> {
  switch (action.type) {
    case "click": {
      const element = findTarget(action.target, root);
      if (!element) throw new Error(`"${action.target}" is not on screen.`);
      await aimAt(element, cursor, sleep);
      cursor.pulse();
      element.click();
      return `Clicked "${labelOf(element) || action.target}".`;
    }
    case "type": {
      const element = findTarget(action.target, root);
      if (!element || !isTextField(element)) throw new Error(`"${action.target}" is not a text field on screen.`);
      await aimAt(element, cursor, sleep);
      cursor.pulse();
      element.focus();
      setNativeValue(element, "");
      let typed = "";
      for (const character of action.text) {
        typed += character;
        setNativeValue(element, typed);
        await sleep(TYPE_DELAY_MS);
      }
      return `Typed "${action.text}".`;
    }
    case "scroll": {
      const container = Array.from(root.querySelectorAll<HTMLElement>(`[${AGENT_SCROLL_ATTRIBUTE}]`)).find(isVisible);
      if (!container) throw new Error("There is nothing to scroll.");
      const delta = container.clientHeight * SCROLL_FRACTION * (action.direction === "down" ? 1 : -1);
      container.scrollBy({ top: delta, behavior: "smooth" });
      await sleep(SCROLL_DELAY_MS);
      return `Scrolled ${action.direction}.`;
    }
    case "done":
    case "fail":
      return action.type;
  }
}
