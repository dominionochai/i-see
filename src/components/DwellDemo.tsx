"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CupSoda, Utensils, X, type LucideIcon } from "lucide-react";

/** How long a tile must be held before it "speaks", like dwell selection in the app. */
const DWELL_MS = 900;
const PROGRESS_STEPS = 30;
const SPARKS = 10;
/** How long the burst and speech bubble stay up. */
const SPOKEN_MS = 2600;

interface Tile {
  id: string;
  label: string;
  phrase: string;
  color: string;
  Icon: LucideIcon;
}

const TILES: readonly Tile[] = [
  { id: "yes", label: "Yes", phrase: "Yes, please!", color: "var(--cat-yes)", Icon: Check },
  { id: "no", label: "No", phrase: "No, thank you.", color: "var(--cat-no)", Icon: X },
  { id: "thirsty", label: "Thirsty", phrase: "I'm thirsty.", color: "var(--cat-thirsty)", Icon: CupSoda },
  { id: "hungry", label: "Hungry", phrase: "I'm hungry.", color: "var(--cat-hungry)", Icon: Utensils },
];

interface Spoken {
  tile: Tile;
  /** Changes on every utterance so the burst animation restarts. */
  key: number;
}

/** Evenly spaced directions for the burst, as CSS offsets. */
const SPARK_OFFSETS = Array.from({ length: SPARKS }, (_, i) => {
  const angle = (i / SPARKS) * Math.PI * 2;
  return { dx: Math.round(Math.cos(angle) * 54), dy: Math.round(Math.sin(angle) * 54) };
});

/**
 * A tiny live demo of the product for the landing page: hold the pointer on a
 * tile (or press it) and it fills, then "speaks" with a burst and a speech
 * bubble, exactly like holding your gaze on a tile in the app.
 */
export function DwellDemo() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [spoken, setSpoken] = useState<Spoken | null>(null);
  const [hasSpoken, setHasSpoken] = useState(false);
  const frameRef = useRef(0);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utteranceRef = useRef(0);

  const speak = useCallback((tile: Tile) => {
    utteranceRef.current += 1;
    setSpoken({ tile, key: utteranceRef.current });
    setHasSpoken(true);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => setSpoken(null), SPOKEN_MS);
  }, []);

  const stopDwell = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    setActiveId(null);
    setProgress(0);
  }, []);

  const startDwell = useCallback((tile: Tile) => {
    cancelAnimationFrame(frameRef.current);
    setActiveId(tile.id);
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / DWELL_MS);
      setProgress(Math.round(elapsed * PROGRESS_STEPS) / PROGRESS_STEPS);
      if (elapsed >= 1) {
        speak(tile);
        // Require leaving and re-entering to repeat, so holding doesn't loop.
        frameRef.current = 0;
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [speak]);

  useEffect(() => () => {
    cancelAnimationFrame(frameRef.current);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3">
      <p className="sr-only" aria-live="polite">{spoken?.tile.phrase ?? ""}</p>

      {/* The bubble floats above the tiles so it never pushes the page layout around. */}
      <div className="relative">
        {spoken && (
          <div
            key={spoken.key}
            aria-hidden="true"
            className="absolute bottom-full left-1/2 mb-5 -translate-x-1/2 whitespace-nowrap rounded-xl border-4 border-slate-900 bg-white px-5 py-2 text-lg font-black text-slate-900 shadow-[4px_4px_0_var(--ink)] motion-safe:animate-[dwell-pop_380ms_cubic-bezier(0.34,1.56,0.64,1)_both]"
          >
            “{spoken.tile.phrase}”
            <span className="absolute -bottom-[11px] left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b-4 border-r-4 border-slate-900 bg-white" />
          </div>
        )}

      <div className="flex items-end justify-center gap-3 md:gap-4" role="group" aria-label="Try it: hold a tile to speak">
        {TILES.map((tile) => {
          const active = activeId === tile.id;
          const burst = spoken?.tile.id === tile.id;
          return (
            <button
              key={tile.id}
              type="button"
              onPointerEnter={() => startDwell(tile)}
              onPointerLeave={stopDwell}
              onPointerCancel={stopDwell}
              onClick={() => speak(tile)}
              style={{ backgroundColor: tile.color }}
              className={`relative grid h-[4.75rem] w-[4.75rem] place-items-center overflow-visible rounded-2xl border-4 border-slate-900 text-slate-900 shadow-[0_6px_0_var(--ink)] transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--btn-purple)] md:h-24 md:w-24 ${active ? "translate-y-1 shadow-[0_2px_0_var(--ink)]" : "hover:-translate-y-0.5"}`}
            >
              <span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-[0.7rem]">
                <span className="absolute inset-x-0 bottom-0 bg-slate-900/25" style={{ height: `${active ? progress * 100 : 0}%` }} />
              </span>
              <span className="relative flex flex-col items-center gap-1">
                <tile.Icon aria-hidden="true" className="h-7 w-7 md:h-8 md:w-8" strokeWidth={2.75} />
                <span className="text-[10px] font-black uppercase tracking-wider md:text-xs">{tile.label}</span>
              </span>
              {burst &&
                SPARK_OFFSETS.map((offset, i) => (
                  <span
                    key={`${spoken.key}-${i}`}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 border-2 border-slate-900 bg-white motion-safe:animate-[dwell-spark_700ms_ease-out_both] motion-reduce:hidden"
                    style={{ "--dx": `${offset.dx}px`, "--dy": `${offset.dy}px`, backgroundColor: i % 2 ? "var(--cat-yes)" : "#fff" } as React.CSSProperties}
                  />
                ))}
            </button>
          );
        })}
      </div>
      </div>

      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900/70">
        {hasSpoken ? "That's i-see: hold your gaze, or blink, to speak" : "Try it: hold your cursor on a tile"}
      </p>
    </div>
  );
}
