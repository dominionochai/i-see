"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { GAZE_ACTION_ATTRIBUTE, useGazeSelect } from "@/hooks/useGazeSelect";
import { runAgent, type AgentEvent, type AgentOutcome } from "@/lib/agent/runner";
import { observeTargets, performAction, type CursorController } from "@/lib/agent/performer";
import { AGENT_LIMITS, type AgentStepRequest, type PlannedStep } from "@/lib/agent/types";

export type AgentStatus = "idle" | "running" | "done" | "failed" | "cancelled";

interface AgentState {
  status: AgentStatus;
  goal: string;
  step: number;
  /** The agent's latest reasoning or outcome, shown on screen. */
  message: string;
}

/** Where the agent works: in a real Chrome window on a mock site, or directly on this app's own screen. */
export type AgentMode = "browser" | "inapp";

export interface AgentApi extends AgentState {
  mode: AgentMode;
  setMode: (mode: AgentMode) => void;
  run: (goal: string) => void;
  cancel: () => void;
}

const IDLE_STATE: AgentState = { status: "idle", goal: "", step: 0, message: "" };
const CURSOR_TRAVEL_MS = 520;
const RIPPLE_MS = 600;
/** Pause after each action so React can render its effect before the next observation. */
const SETTLE_MS = 450;
/** How long the outcome stays on screen after the agent finishes. */
const OUTCOME_VISIBLE_MS = 6000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const POLL_MS = 700;

const AgentContext = createContext<AgentApi>({
  ...IDLE_STATE,
  mode: "browser",
  setMode: () => undefined,
  run: () => undefined,
  cancel: () => undefined,
});

export const useAgent = () => useContext(AgentContext);

async function requestPlannedStep(request: AgentStepRequest, signal: AbortSignal): Promise<PlannedStep> {
  const response = await fetch("/api/agent/step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const body = (await response.json().catch(() => null)) as (PlannedStep & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? `The planner failed (${response.status}).`);
  return body;
}

interface BrowserRunSnapshot {
  id: string;
  status: "starting" | "running" | "done" | "failed" | "cancelled";
  step: number;
  message: string;
}

const errorMessageOf = async (response: Response, fallback: string) =>
  ((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? fallback;

/** Starts an agent in a real browser and reports its progress until it finishes or is stopped. */
async function runInBrowser(
  goal: string,
  signal: AbortSignal,
  onProgress: (snapshot: BrowserRunSnapshot) => void,
): Promise<AgentOutcome> {
  const start = await fetch("/api/agent/browser", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goal }),
  });
  if (!start.ok) return { status: "failed", reason: await errorMessageOf(start, `Could not start the browser agent (${start.status}).`), steps: 0 };
  const { id } = (await start.json()) as BrowserRunSnapshot;

  for (;;) {
    if (signal.aborted) {
      await fetch(`/api/agent/browser?run=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
      return { status: "cancelled", steps: 0 };
    }
    await sleep(POLL_MS);
    let snapshot: BrowserRunSnapshot;
    try {
      const response = await fetch(`/api/agent/browser?run=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) return { status: "failed", reason: await errorMessageOf(response, "Lost track of the browser agent."), steps: 0 };
      snapshot = (await response.json()) as BrowserRunSnapshot;
    } catch {
      return { status: "failed", reason: "Lost the connection to the browser agent.", steps: 0 };
    }
    onProgress(snapshot);
    if (snapshot.status === "done") return { status: "done", summary: snapshot.message, steps: snapshot.step };
    if (snapshot.status === "failed") return { status: "failed", reason: snapshot.message, steps: snapshot.step };
    if (snapshot.status === "cancelled") return { status: "cancelled", steps: snapshot.step };
  }
}

function outcomeMessage(outcome: AgentOutcome): string {
  switch (outcome.status) {
    case "done": return outcome.summary;
    case "failed": return outcome.reason;
    case "cancelled": return "Stopped.";
  }
}

/**
 * Hosts the on-screen agent: it observes the page, asks the planner what to do
 * next, and carries the action out with a visible cursor. Everything it can
 * touch is marked with `data-agent-id`.
 */
export function AgentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AgentState>(IDLE_STATE);
  const [mode, setMode] = useState<AgentMode>("browser");
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [ripple, setRipple] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hudRef = useRef<HTMLDivElement>(null);

  const cursorController = useMemo<CursorController>(() => ({
    moveTo: async (x, y) => {
      setCursor({ x, y });
      await sleep(CURSOR_TRAVEL_MS);
    },
    pulse: () => setRipple((count) => count + 1),
  }), []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const run = useCallback((goal: string) => {
    const trimmed = goal.trim().slice(0, AGENT_LIMITS.goalChars);
    if (!trimmed || abortRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setState({ status: "running", goal: trimmed, step: 0, message: "Looking at the screen…" });

    const onEvent = (event: AgentEvent) => {
      if (event.type === "plan") {
        setState((prev) => ({ ...prev, step: event.step, message: event.thought || "Working on it…" }));
      }
    };

    const outcomePromise = mode === "browser"
      ? runInBrowser(trimmed, controller.signal, (snapshot) =>
          setState((prev) => ({ ...prev, step: snapshot.step, message: snapshot.message })))
      : runAgent(trimmed, {
          observe: observeTargets,
          plan: requestPlannedStep,
          perform: (action) => performAction(action, cursorController),
          signal: controller.signal,
          onEvent,
          settle: () => sleep(SETTLE_MS),
        });

    void outcomePromise.then((outcome) => {
      abortRef.current = null;
      setState((prev) => ({ ...prev, status: outcome.status, message: outcomeMessage(outcome) }));
      setCursor(null);
      hideTimerRef.current = setTimeout(() => setState(IDLE_STATE), OUTCOME_VISIBLE_MS);
    });
  }, [cursorController, mode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") abortRef.current?.abort();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      abortRef.current?.abort();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useGazeSelect({ rootRef: hudRef, dwellMs: 700, enabled: state.status === "running" });

  const api = useMemo<AgentApi>(() => ({ ...state, mode, setMode, run, cancel }), [state, mode, run, cancel]);
  const visible = state.status !== "idle";

  return (
    <AgentContext.Provider value={api}>
      {children}

      {cursor && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 z-[10000]"
          style={{
            transform: `translate(${cursor.x}px, ${cursor.y}px)`,
            transition: `transform ${CURSOR_TRAVEL_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" className="-translate-x-1 -translate-y-1 drop-shadow-lg">
            <path d="M4 2l16 9-7 2-3 7z" fill="#00897B" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          {ripple > 0 && (
            <span
              key={ripple}
              className="absolute -left-4 -top-4 h-8 w-8 rounded-full border-2 border-[var(--btn-purple)]"
              style={{ animation: `agent-ripple ${RIPPLE_MS}ms ease-out forwards` }}
            />
          )}
        </div>
      )}

      {visible && (
        <div
          ref={hudRef}
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-[10000] flex w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border-4 border-[var(--ink)] bg-white px-4 py-3 text-[var(--ink)] shadow-[6px_6px_0_var(--ink)]"
        >
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${state.status === "running" ? "animate-pulse bg-[var(--btn-purple)]" : state.status === "done" ? "bg-[var(--iris-success)]" : "bg-[var(--cat-yes)]"}`}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-[var(--btn-purple)]">
              i-see agent{state.status === "running" && state.step > 0 ? ` · step ${state.step}` : ""} · {state.goal}
            </p>
            <p className="truncate text-sm">{state.message}</p>
          </div>
          {state.status === "running" && (
            <button
              type="button"
              {...{ [GAZE_ACTION_ATTRIBUTE]: "agent-stop" }}
              onClick={cancel}
              className="shrink-0 rounded-lg border-2 border-[var(--ink)] bg-[var(--cat-no)] px-3 py-1.5 text-xs font-black text-white shadow-[0_3px_0_var(--ink)]"
            >
              Stop (Esc)
            </button>
          )}
        </div>
      )}
    </AgentContext.Provider>
  );
}
