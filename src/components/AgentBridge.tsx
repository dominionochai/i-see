"use client";

import { useEffect } from "react";
import { observeTargets } from "@/lib/agent/performer";

declare global {
  interface Window {
    /** Lets an external driver (Playwright) list what the agent can see. */
    __irisObserve?: typeof observeTargets;
    __irisReady?: boolean;
  }
}

/** Exposes the page's agent-visible controls to an external browser driver. Renders nothing. */
export function AgentBridge() {
  useEffect(() => {
    window.__irisObserve = observeTargets;
    window.__irisReady = true;
    return () => {
      delete window.__irisObserve;
      window.__irisReady = false;
    };
  }, []);
  return null;
}
