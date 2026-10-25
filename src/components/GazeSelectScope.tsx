"use client";

import { createContext, useContext, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { GAZE_ACTION_ATTRIBUTE, useGazeSelect } from "@/hooks/useGazeSelect";
import { useGazeModal } from "@/hooks/useGazeModal";

const FocusContext = createContext<{ focusedId: string | null; progress: number }>({ focusedId: null, progress: 0 });

interface GazeSelectScopeProps {
  children: ReactNode;
  className?: string;
  label: string;
  dwellMs?: number;
  /** Full-screen panel: gaze buttons outside it are ignored while it is open. */
  modal?: boolean;
}

/** A region whose {@link GazeAction} buttons can be selected by dwell or blink. */
export function GazeSelectScope({ children, className, label, dwellMs, modal = false }: GazeSelectScopeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useGazeModal(modal);
  const focus = useGazeSelect({ rootRef, dwellMs });
  return (
    <FocusContext.Provider value={focus}>
      <div
        ref={rootRef}
        role="region"
        aria-label={label}
        className={className}
        {...(modal ? { "data-gaze-modal-root": "" } : {})}
      >
        {children}
      </div>
    </FocusContext.Provider>
  );
}

interface GazeActionProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "id"> {
  /** Unique within the scope; identifies the button for gaze selection. */
  id: string;
  /**
   * Whether the on-screen agent may press this button, and under which name.
   * `false` hides it from the agent. Defaults to `id`.
   */
  agent?: string | false;
  /** What the agent sees for this button; defaults to the button's text. */
  agentLabel?: string;
}

/** A button selectable by gaze (dwell/blink), mouse, touch, keyboard, or the agent, all through one `onClick`. */
export function GazeAction({ id, agent, agentLabel, className = "", children, ...rest }: GazeActionProps) {
  const { focusedId, progress } = useContext(FocusContext);
  const agentId = agent === false ? undefined : agent ?? id;
  const focused = focusedId === id;
  return (
    <button
      type="button"
      {...rest}
      {...{ [GAZE_ACTION_ATTRIBUTE]: id }}
      data-agent-id={agentId}
      data-agent-label={agentId ? agentLabel : undefined}
      className={`relative overflow-hidden ${focused ? "ring-4 ring-[var(--btn-purple)]" : ""} ${className}`}
    >
      {children}
      {focused && (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 bg-[var(--ink)]/10">
          <span className="block h-full bg-[var(--btn-purple)]" style={{ width: `${progress * 100}%` }} />
        </span>
      )}
    </button>
  );
}
