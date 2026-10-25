"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { GAZE_ACTION_ATTRIBUTE } from "@/hooks/useGazeSelect";
import { useGaze } from "@/lib/gazeContext";
import { decodeSwipe, type Candidate } from "@/lib/swipe/decoder";
import {
  KEY_CENTERS, KEY_ROWS, KEYBOARD_COLUMNS, KEYBOARD_HEIGHT, KEYBOARD_ROWS, KEYBOARD_WIDTH, type KeyPoint,
} from "@/lib/swipe/layout";
import { pointInRect } from "@/lib/sceneMapping";

const SAMPLE_MS = 33;
const MAX_SWIPE_MS = 8000;
/** The decoder's ranking is refined by the language model only if it answers in time. */
const RERANK_TIMEOUT_MS = 1200;
const CANDIDATES_SHOWN = 6;

type Phase = "idle" | "capturing" | "choosing";

interface SwipeKeyboardProps {
  /** The sentence so far, used to pick between look-alike words. */
  sentence: string;
  onWord: (word: string) => void;
  /** Which selectable element the gaze is on, and how far through the dwell it is. */
  focusedId: string | null;
  progress: number;
  /** Receives short status text for screen readers. */
  onStatus?: (message: string) => void;
}

async function rerank(sentence: string, words: string[], signal: AbortSignal): Promise<string[] | null> {
  try {
    const response = await fetch("/api/keyboard/rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: sentence, candidates: words }),
      signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { ranked?: string[] };
    return Array.isArray(body.ranked) ? body.ranked : null;
  } catch {
    return null;
  }
}

/** Swipe typing with the eyes: look at the first letter and blink, sweep through the letters, blink again. */
export function SwipeKeyboard({ sentence, onWord, focusedId, progress, onStatus }: SwipeKeyboardProps) {
  const { gazePositionRef, blinkCount } = useGaze();
  const [phase, setPhase] = useState<Phase>("idle");
  const [trail, setTrail] = useState<KeyPoint[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [refining, setRefining] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<KeyPoint[]>([]);
  const phaseRef = useRef<Phase>("idle");
  const swipeIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastBlinkRef = useRef(blinkCount);
  const sentenceRef = useRef(sentence);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    sentenceRef.current = sentence;
    onStatusRef.current = onStatus;
  });

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  /** Converts a screen position to key-width units within the key area, or null if outside. */
  const toKeyUnits = useCallback((x: number, y: number): KeyPoint | null => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const hit = pointInRect(x, y, rect);
    return hit ? { x: hit.u * KEYBOARD_WIDTH, y: hit.v * KEYBOARD_HEIGHT } : null;
  }, []);

  const finishSwipe = useCallback(async () => {
    const swipeId = (swipeIdRef.current += 1);
    const decoded = decodeSwipe(pathRef.current, { limit: CANDIDATES_SHOWN });
    if (decoded.length === 0) {
      setCandidates([]);
      setPhaseBoth("idle");
      onStatusRef.current?.("No word matched. Look at the first letter and blink to try again.");
      return;
    }
    setCandidates(decoded);
    setPhaseBoth("choosing");
    onStatusRef.current?.(`${decoded.length} suggestions. Look at one and blink to choose.`);

    if (decoded.length < 2) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), RERANK_TIMEOUT_MS);
    setRefining(true);
    const ranked = await rerank(sentenceRef.current, decoded.map((candidate) => candidate.word), controller.signal);
    clearTimeout(timeout);
    // Ignore the answer if the person has already moved on to another swipe.
    if (swipeId !== swipeIdRef.current || phaseRef.current !== "choosing") return;
    setRefining(false);
    if (ranked) {
      const byWord = new Map(decoded.map((candidate) => [candidate.word, candidate]));
      setCandidates(ranked.flatMap((word) => byWord.get(word) ?? []));
    }
  }, []);

  // Blinks over the keys start and end a swipe; blinks elsewhere belong to other controls.
  useEffect(() => {
    if (blinkCount > lastBlinkRef.current) {
      const { x, y } = gazePositionRef.current;
      const point = toKeyUnits(x, y);
      if (point) {
        if (phaseRef.current === "capturing") {
          pathRef.current.push(point);
          void finishSwipe();
        } else {
          abortRef.current?.abort();
          swipeIdRef.current += 1;
          pathRef.current = [point];
          setTrail([point]);
          setCandidates([]);
          setRefining(false);
          setPhaseBoth("capturing");
          onStatusRef.current?.("Swiping. Sweep through the letters, then blink to finish.");
        }
      }
    }
    lastBlinkRef.current = blinkCount;
  }, [blinkCount, finishSwipe, gazePositionRef, toKeyUnits]);

  // While swiping, sample the gaze and draw the trail.
  useEffect(() => {
    if (phase !== "capturing") return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const { x, y } = gazePositionRef.current;
      const point = toKeyUnits(x, y);
      const last = pathRef.current[pathRef.current.length - 1];
      if (point && (!last || last.x !== point.x || last.y !== point.y)) {
        pathRef.current.push(point);
        setTrail([...pathRef.current]);
      }
      if (Date.now() - startedAt > MAX_SWIPE_MS) void finishSwipe();
    }, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [phase, finishSwipe, gazePositionRef, toKeyUnits]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const choose = (word: string) => {
    onWord(word);
    setCandidates([]);
    setTrail([]);
    setRefining(false);
    setPhaseBoth("idle");
  };

  const hint = phase === "capturing"
    ? "Swiping… sweep through the letters, then blink"
    : phase === "choosing" ? "Look at a word and blink to choose it" : "Look at the first letter and blink to start a swipe";

  return (
    <div className="space-y-3">
      <div className="flex min-h-12 flex-wrap items-center gap-2" role="group" aria-label="Word suggestions">
        {candidates.length === 0 && <span className="text-sm font-bold text-[var(--iris-text-secondary)]">{hint}</span>}
        {candidates.map((candidate) => {
          const id = `candidate:${candidate.word}`;
          const focused = focusedId === id;
          return (
            <button
              key={candidate.word}
              type="button"
              {...{ [GAZE_ACTION_ATTRIBUTE]: id }}
              onClick={() => choose(candidate.word)}
              className={`relative overflow-hidden rounded-xl border-[3px] border-[var(--ink)] bg-[var(--cat-yes)] px-5 py-2 text-xl font-black text-[var(--ink)] shadow-[0_4px_0_var(--ink)] ${focused ? "ring-4 ring-[var(--btn-purple)]" : ""}`}
            >
              {candidate.word}
              {focused && (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 bg-[var(--ink)]/10">
                  <span className="block h-full bg-[var(--btn-purple)]" style={{ width: `${progress * 100}%` }} />
                </span>
              )}
            </button>
          );
        })}
        {refining && <span className="text-xs font-bold text-[var(--btn-purple)]">refining…</span>}
      </div>

      <KeySurface surfaceRef={surfaceRef} trail={trail} active={phase === "capturing"} />
    </div>
  );
}

interface KeySurfaceProps {
  surfaceRef: RefObject<HTMLDivElement | null>;
  trail: readonly KeyPoint[];
  active: boolean;
}

function KeySurface({ surfaceRef, trail, active }: KeySurfaceProps) {
  const points = trail.map((point) => `${point.x},${point.y}`).join(" ");
  const keyHeight = 100 / KEYBOARD_ROWS;
  return (
    <div
      ref={surfaceRef}
      role="img"
      aria-label="Swipe keyboard"
      className={`relative w-full select-none overflow-hidden rounded-2xl border-4 bg-white ${active ? "border-[var(--btn-purple)]" : "border-[var(--ink)]"}`}
      style={{ aspectRatio: `${KEYBOARD_WIDTH} / ${KEYBOARD_HEIGHT}` }}
    >
      {KEY_ROWS.flatMap(({ letters }, row) =>
        [...letters].map((letter) => {
          const center = KEY_CENTERS[letter];
          return (
            <span
              key={letter}
              aria-hidden="true"
              className="absolute grid place-items-center p-[3px]"
              style={{
                left: `${((center.x - 0.5) / KEYBOARD_COLUMNS) * 100}%`,
                top: `${row * keyHeight}%`,
                width: `${100 / KEYBOARD_COLUMNS}%`,
                height: `${keyHeight}%`,
              }}
            >
              <span className="grid h-full w-full place-items-center rounded-lg border-2 border-[var(--ink)] bg-[var(--iris-surface-raised)] text-lg font-black uppercase text-[var(--ink)] md:text-xl">
                {letter}
              </span>
            </span>
          );
        }),
      )}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${KEYBOARD_WIDTH} ${KEYBOARD_HEIGHT}`}
        preserveAspectRatio="none"
      >
        {trail.length > 1 && (
          <polyline points={points} fill="none" stroke="var(--btn-purple)" strokeWidth={0.22} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 6 }} />
        )}
        {trail.length > 0 && <circle cx={trail[trail.length - 1].x} cy={trail[trail.length - 1].y} r={0.22} fill="var(--cat-no)" stroke="white" strokeWidth={0.06} />}
      </svg>
    </div>
  );
}

