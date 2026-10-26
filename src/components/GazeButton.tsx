"use client";

import { useIrisStore } from "@/store/useIrisStore";
import React, { useRef, useState, useEffect } from "react";
import { ttsService } from "@/utils/ttsService";
import { webLlmService } from "@/utils/webLlmService";
import { useGaze } from "@/lib/gazeContext";

const DWELL_VISUAL_MS = 1800; // visual feedback for dwell

/** True while a full-screen panel is open and this button is not part of it. */
const isBehindModal = (element: HTMLElement) =>
  document.body.hasAttribute("data-gaze-modal") && !element.closest("[data-gaze-modal-root]");

interface GazeButtonProps {
  id: string;
  text: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  customDwellTime?: number;
  "data-block-id"?: string;
  "data-disabled"?: boolean;
  colorClass?: string;
  accentColor?: string;
  textColor?: string;
  onClick?: () => void;
  textClassName?: string;
}

export function GazeButton({ 
  id, 
  text,
  icon: Icon,
  className = "", 
  customDwellTime = 600,
  "data-block-id": dataBlockId,
  "data-disabled": dataDisabled,
  colorClass = "",
  accentColor,
  textColor,
  onClick,
  textClassName,
}: GazeButtonProps) {
  const { isDebugMode } = useIrisStore();
  const { gazePositionRef, blinkCount, isCalibrating, hoverStateRef } = useGaze();

  const btnRef        = useRef<HTMLDivElement>(null);
  const wasHoveredRef = useRef(false);
  const dwellStartRef = useRef(0);
  const prevBlinkRef  = useRef(blinkCount);
  const rafRef        = useRef<number>(0);

  const [isHovered, setIsHovered] = useState(false);
  const [justSelected, setJustSelected] = useState(false);

  // RAF: bounds checking + dwell ring update (no cross-component setState)
  useEffect(() => {
    const CIRC = 2 * Math.PI * 14;

    const tick = () => {
      if (btnRef.current && !dataDisabled) {
        const { x, y } = gazePositionRef.current;
        const r = btnRef.current.getBoundingClientRect();
        
        let hit = false;
        if (r.width > 0 && r.height > 0 && !isBehindModal(btnRef.current)) {
          const margin = wasHoveredRef.current ? 60 : 0;
          hit = x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin;
        }
        
        const was = wasHoveredRef.current;

        if (hit !== was) {
          wasHoveredRef.current = hit;
          setIsHovered(hit);

          if (hit) {
            dwellStartRef.current = performance.now();
            hoverStateRef.current = { isHovering: true, dwellPct: 0, snapTarget: undefined };
          } else {
            // Clear hover state
            if (hoverStateRef.current.isHovering) {
              hoverStateRef.current = { isHovering: false, dwellPct: 0, snapTarget: undefined };
            }
          }
        }

        // While hovering: update hover state for the cursor to draw the ring and snap
        if (hit) {
          const pct = Math.min(1, (performance.now() - dwellStartRef.current) / DWELL_VISUAL_MS);
          
          // Once the dwell starts, provide the center of the button to the cursor to snap to
          const snapTarget = pct > 0.05 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined;
          hoverStateRef.current = { isHovering: true, dwellPct: pct, snapTarget };
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (wasHoveredRef.current && hoverStateRef.current.isHovering) {
        hoverStateRef.current = { isHovering: false, dwellPct: 0, snapTarget: undefined };
      }
    };
  }, [gazePositionRef, hoverStateRef, dataDisabled]);

  const triggerAction = () => {
    if (onClick) {
      onClick();
      return;
    }

    const state = useIrisStore.getState();

    if (id === "wake-block") {
      state.setSleepMode(false);
    } else if (id === "close-modal") {
      state.setShowMediaModal(false);
    } else if (id === "close-env-modal") {
      state.setShowEnvironmentModal(false);
    } else if (id === "speak-block") {
      // executeAction handles the dwell-click dispatch — don't fire it here too
      useIrisStore.getState().executeAction("speak-block", document.getElementById("speak-block") || undefined);
      
      // Auto-clear sentence after speaking
      // @ts-ignore
      if (window.clearSentenceTimeout) clearTimeout(window.clearSentenceTimeout);
      // @ts-ignore
      window.clearSentenceTimeout = setTimeout(() => {
        useIrisStore.getState().executeAction("clear-block", undefined);
      }, 4000);

    } else if (id.startsWith("pred-")) {
      // executeAction handles the speak — don't dispatch dwell-click here too
      useIrisStore.getState().executeAction(id, document.getElementById(id) || undefined);

      // Auto-clear sentence after speaking
      // @ts-ignore
      if (window.clearSentenceTimeout) clearTimeout(window.clearSentenceTimeout);
      // @ts-ignore
      window.clearSentenceTimeout = setTimeout(() => {
        useIrisStore.getState().executeAction("clear-block", undefined);
      }, 4000);

    } else if (id.startsWith("tone-block-")) {
      const tone = id.replace("tone-block-", "");
      state.setActiveTone(state.activeTone === tone ? null : tone);
    } else if (id === "grid-block-Adjust") {
      // No-op for now
    } else {
      const nodeVal = dataBlockId || id.replace("grid-block-", "");
      if (nodeVal === "EMERGENCY") {
        fetch('/api/twilio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Emergency alert triggered.' })
        }).catch(console.error);
        return;
      }
      
      if (state.isContextResponse && id.startsWith("pred-")) {
        const doctorContext = useIrisStore.getState().ambientContext; // capture BEFORE clearing
        state.setGeneratedSpeech(nodeVal);
        state.setIsContextResponse(false);
        state.setPredictions([]);
        state.setAmbientContext("");

        // --- Direct hardware trigger based on button text + doctor context ---
        const lowerVal = nodeVal.toLowerCase();
        const lowerCtx = doctorContext.toLowerCase();

        let device: string | null = null;
        let hwState: string | null = null;

        if (lowerVal.includes("turn on the fan") || (lowerVal === "yes" && (lowerCtx.includes("hot") || lowerCtx.includes("warm")))) {
          device = "fan"; hwState = "ON";
        } else if (lowerVal.includes("turn off the fan") || (lowerVal === "yes" && lowerCtx.includes("cold"))) {
          device = "fan"; hwState = "OFF";
        } else if (lowerVal.includes("turn on the light") || (lowerVal === "yes" && lowerCtx.includes("dark"))) {
          device = "light"; hwState = "ON";
        } else if (lowerVal.includes("turn off the light") || (lowerVal === "yes" && lowerCtx.includes("bright"))) {
          device = "light"; hwState = "OFF";
        }

        if (device && hwState) {
          console.log(`[GazeButton] Direct hardware trigger: ${device} -> ${hwState}`);
          fetch("/api/room-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device, state: hwState }),
          }).catch(err => console.error("Hardware API error:", err));
        }

        ttsService.speak(nodeVal);
      } else if (nodeVal === "Sleep Mode") {
        state.setSleepMode(true);
      } else if (nodeVal === "Re-Optimize Layout") {
        state.reoptimizeLayout();
      } else if (nodeVal === "Music" && state.selectedNodes.includes("Entertainment")) {
        state.setShowMediaModal(true);
        state.clearNodes();
      } else if (nodeVal === "Environment") {
        state.setShowEnvironmentModal(true);
        state.clearNodes();
      } else {
        state.addNode(nodeVal);
        state.incrementFrequency(nodeVal);
        webLlmService.predictNextWords(state.selectedNodes);
      }
    }
  };

  // Blink-to-select logic
  useEffect(() => {
    if (isCalibrating) {
      prevBlinkRef.current = blinkCount;
      return;
    }
    if (blinkCount !== prevBlinkRef.current) {
      prevBlinkRef.current = blinkCount;
      if (isHovered && !dataDisabled) {
        triggerAction();
        setTimeout(() => setJustSelected(true), 0);
        setTimeout(() => setJustSelected(false), 600);
      }
    }
  }, [blinkCount, isHovered, isCalibrating, dataDisabled]);

  const handleClick = () => {
    if (isDebugMode && !dataDisabled) {
      setJustSelected(true);
      try {
        triggerAction();
      } finally {
        setTimeout(() => setJustSelected(false), 600);
      }
    }
  };

  const accentStyle: React.CSSProperties = {};
  if (dataDisabled) {
    accentStyle.backgroundColor = '#e5e7eb'; // light grey
    accentStyle.boxShadow = `0 6px 0px black`;
    accentStyle.color = '#9ca3af';
    accentStyle.border = '3px solid var(--ink)';
  } else if (accentColor) {
    accentStyle.backgroundColor = accentColor;
    accentStyle.boxShadow = `0 6px 0px black`;
    accentStyle.border = '3px solid var(--ink)';
  }

  const effectiveTextColor = dataDisabled ? 'black' : (textColor || 'black');

  return (
    <div
      ref={btnRef}
      id={id}
      data-block-id={dataBlockId}
      data-disabled={dataDisabled || undefined}
      data-locked={isHovered || undefined}
      onClick={handleClick}
      className={`gaze-tile ${className}`}
      style={{
        ...accentStyle,
        borderRadius: '24px',
        transform: justSelected ? 'translateY(6px)' : 'translateY(0px)',
        transition: 'background 0.1s ease, box-shadow 0.1s ease, transform 0.1s ease',
        boxShadow: justSelected 
          ? `0 0px 0px black` 
          : accentStyle.boxShadow,
      }}
    >
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-2 p-3">
        {Icon && (
          <span style={{ color: effectiveTextColor }}>
            <Icon className="w-7 h-7 md:w-8 md:h-8 shrink-0 opacity-85" />
          </span>
        )}
        <span 
          className={textClassName || "font-bold text-sm md:text-base lg:text-lg tracking-wide w-full text-center break-words whitespace-normal leading-snug line-clamp-2"}
          style={{ color: effectiveTextColor }}
        >
          {text}
        </span>
      </div>

      {justSelected && (
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: 24,
          background: 'rgba(255, 255, 255, 0.2)',
          animation: 'flash 0.5s ease-out forwards',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}
