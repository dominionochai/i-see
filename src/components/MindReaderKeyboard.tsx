"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import { SwipeKeyboard } from "@/components/SwipeKeyboard";
import { GAZE_ACTION_ATTRIBUTE, MIN_DWELL_MS, useGazeSelect } from "@/hooks/useGazeSelect";
import { getPredictions } from "@/lib/wordPrediction";
import { gazeTextReducer, INITIAL_GAZE_TEXT } from "@/lib/gazeTextReducer";
import { ttsService } from "@/utils/ttsService";

const DEFAULT_DWELL_MS = 900;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const idleAnnouncement = (mode: "swipe" | "letters", dwellMs: number) =>
  mode === "swipe"
    ? "Look at the first letter and blink, sweep your eyes through the letters, then blink again. Choose a word with a blink."
    : `Hold your gaze on a key for ${dwellMs / 1000} seconds, or blink, to type it.`;

const INK = "var(--ink)";
const BORDER = `3px solid ${INK}`;

const styles: Record<string, CSSProperties> = {
  root: {
    width: "100%",
    maxWidth: 880,
    margin: "0 auto",
    padding: 14,
    color: INK,
    background: "#ffffff",
    border: "4px solid var(--ink)",
    borderRadius: 20,
    boxShadow: "6px 6px 0 var(--ink)",
    fontFamily: "inherit",
  },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  heading: { margin: 0, fontSize: 20, fontWeight: 900, textTransform: "uppercase" },
  help: { margin: "0 0 16px", color: "var(--iris-text-secondary)", lineHeight: 1.5, fontWeight: 600 },
  label: { display: "block", marginBottom: 8, fontWeight: 800 },
  output: {
    boxSizing: "border-box",
    width: "100%",
    minHeight: 0,
    resize: "none",
    padding: 12,
    border: BORDER,
    borderRadius: 12,
    color: INK,
    background: "var(--iris-surface-raised)",
    font: "inherit",
    fontSize: 18,
    lineHeight: 1.5,
  },
  groupLabel: { margin: "14px 0 8px", fontWeight: 800, textTransform: "uppercase", fontSize: 12, letterSpacing: "0.12em" },
  suggestions: { display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0" },
  modes: { display: "flex", gap: 8 },
  controls: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 12 },
  grid: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 10 },
  key: {
    position: "relative",
    overflow: "hidden",
    minHeight: 56,
    padding: "10px 6px",
    border: BORDER,
    borderRadius: 12,
    color: INK,
    background: "var(--iris-surface-raised)",
    boxShadow: `0 4px 0 ${INK}`,
    font: "inherit",
    fontSize: 20,
    fontWeight: 900,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  control: {
    position: "relative",
    overflow: "hidden",
    minHeight: 52,
    padding: "8px 12px",
    border: BORDER,
    borderRadius: 12,
    color: INK,
    background: "#ffffff",
    boxShadow: `0 4px 0 ${INK}`,
    font: "inherit",
    fontWeight: 800,
    cursor: "pointer",
  },
  prediction: {
    position: "relative",
    overflow: "hidden",
    minHeight: 48,
    padding: "8px 16px",
    border: BORDER,
    borderRadius: 999,
    color: INK,
    background: "var(--cat-yes)",
    boxShadow: `0 3px 0 ${INK}`,
    font: "inherit",
    fontWeight: 800,
    cursor: "pointer",
  },
  active: { outline: "4px solid var(--btn-purple)", outlineOffset: 1 },
  dwellTrack: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: 6,
    background: "rgba(42, 14, 58, 0.12)",
    pointerEvents: "none",
  },
  dwellFill: { display: "block", height: "100%", background: "var(--btn-purple)", transition: "width 50ms linear" },
  status: { minHeight: 20, margin: "10px 0 0", color: "var(--iris-text-secondary)", fontSize: 14, fontWeight: 600 },
};

type MindReaderKeyboardProps = {
  /** Optional dwell duration; defaults to 900ms. */
  dwellMs?: number;
  /** Receives the complete visible text whenever it changes. */
  onTextChange?: (text: string) => void;
  /** Optional notification after the built-in TTS service is invoked. */
  onSpeak?: (text: string) => void;
};

export default function MindReaderKeyboard({
  dwellMs = DEFAULT_DWELL_MS,
  onTextChange,
  onSpeak,
}: MindReaderKeyboardProps) {
  const [text, dispatch] = useReducer(gazeTextReducer, INITIAL_GAZE_TEXT);
  const [announcement, setAnnouncement] = useState(() => idleAnnouncement("swipe", Math.max(MIN_DWELL_MS, dwellMs)));
  const [mode, setMode] = useState<"swipe" | "letters">("swipe");
  const rootRef = useRef<HTMLElement>(null);

  const output = `${text.sentence}${text.draft}`;
  const outputRef = useRef(output);
  const onSpeakRef = useRef(onSpeak);
  useEffect(() => {
    outputRef.current = output;
    onSpeakRef.current = onSpeak;
  });

  const lastWord = text.sentence.trim().split(/\s+/).pop() ?? "";
  const predictions = useMemo(() => getPredictions(text.draft, lastWord), [text.draft, lastWord]);

  useEffect(() => {
    onTextChange?.(output);
  }, [onTextChange, output]);

  // Stable across renders: the dwell timer and blink handler call it without re-subscribing.
  const activateAction = useCallback((action: string) => {
    const separator = action.indexOf(":");
    const kind = separator === -1 ? action : action.slice(0, separator);
    const value = separator === -1 ? "" : action.slice(separator + 1);
    switch (kind) {
      case "letter":
        dispatch({ type: "letter", letter: value });
        setAnnouncement(`Added ${value}.`);
        break;
      case "prediction":
        dispatch({ type: "word", word: value });
        setAnnouncement(`Inserted ${value}.`);
        break;
      case "mode":
        {
          const next = value === "letters" ? "letters" : "swipe";
          setMode(next);
          setAnnouncement(idleAnnouncement(next, Math.max(MIN_DWELL_MS, dwellMs)));
        }
        break;
      case "space":
        dispatch({ type: "space" });
        setAnnouncement("Added a space.");
        break;
      case "backspace":
        dispatch({ type: "backspace" });
        setAnnouncement("Deleted the previous character.");
        break;
      case "clear":
        dispatch({ type: "clear" });
        setAnnouncement("Sentence cleared.");
        break;
      case "speak": {
        const sentence = outputRef.current.trim();
        if (!sentence) {
          setAnnouncement("Type or insert a sentence before speaking.");
          break;
        }
        void ttsService.speak(sentence);
        onSpeakRef.current?.(sentence);
        setAnnouncement("Speaking the sentence.");
        break;
      }
    }
  }, [dwellMs]);

  const { focusedId: focusedAction, progress: dwellProgress } = useGazeSelect({
    rootRef,
    dwellMs,
    onFocusChange: (_id, element) => {
      if (element) setAnnouncement(`Looking at ${element.getAttribute("aria-label") ?? "a key"}. Hold to select.`);
    },
  });

  const renderButton = (
    action: string,
    label: string,
    ariaLabel: string,
    kind: "key" | "control" | "prediction" = "key",
  ) => {
    const baseStyle = kind === "key" ? styles.key : kind === "prediction" ? styles.prediction : styles.control;
    const isFocused = focusedAction === action;
    const isSelectedMode = action === `mode:${mode}`;
    const progress = isFocused ? dwellProgress : 0;
    return (
      <button
        key={action}
        type="button"
        {...{ [GAZE_ACTION_ATTRIBUTE]: action }}
        aria-label={ariaLabel}
        aria-pressed={action.startsWith("mode:") ? isSelectedMode : isFocused}
        style={{ ...baseStyle, ...(isSelectedMode ? { background: "var(--cat-yes)" } : {}), ...(isFocused ? styles.active : {}) }}
        onClick={() => activateAction(action)}
        onKeyDown={(event) => {
          // Enter/Space activate the button natively; keep the global blink shortcut from also firing.
          if (event.key === "Enter" || event.key === " ") event.stopPropagation();
        }}
      >
        {label}
        <span aria-hidden="true" style={styles.dwellTrack}>
          <span style={{ ...styles.dwellFill, width: `${progress * 100}%` }} />
        </span>
      </button>
    );
  };

  return (
    <section ref={rootRef} aria-labelledby="mind-reader-keyboard-title" style={styles.root}>
      <div style={styles.titleRow}>
        <h2 id="mind-reader-keyboard-title" style={styles.heading}>Gaze keyboard</h2>
        <div role="group" aria-label="Typing mode" style={styles.modes}>
          {renderButton("mode:swipe", "Swipe", "Swipe typing", "control")}
          {renderButton("mode:letters", "Letters", "Letter keys", "control")}
        </div>
      </div>

      <textarea
        id="mind-reader-sentence"
        aria-label="Sentence output"
        readOnly
        rows={2}
        value={output}
        placeholder="Your sentence will appear here"
        style={styles.output}
      />

      <div role="group" aria-label="Next-word predictions" style={styles.suggestions}>
        {predictions.length
          ? predictions.map((word) => renderButton(
              `prediction:${word}`,
              word,
              `Insert predicted word ${word}`,
              "prediction",
            ))
          : <span style={{ color: "var(--iris-text-secondary)" }}>No matching words</span>}
      </div>

      {mode === "swipe" ? (
        <>
          <SwipeKeyboard
            sentence={text.sentence}
            onWord={(word) => activateAction(`prediction:${word}`)}
            focusedId={focusedAction}
            progress={dwellProgress}
            onStatus={setAnnouncement}
          />
          <div role="group" aria-label="Editing" style={styles.controls}>
            {renderButton("backspace", "⌫", "Delete the previous character", "control")}
            {renderButton("clear", "Clear", "Clear the sentence", "control")}
            {renderButton("speak", "Speak", "Speak the sentence aloud", "control")}
          </div>
        </>
      ) : (
        <div role="group" aria-label="A to Z gaze keyboard" style={styles.grid}>
          {LETTERS.map((letter) => renderButton(`letter:${letter}`, letter, `Type ${letter}`))}
          {renderButton("space", "SPACE", "Insert a space and commit the current word", "control")}
          {renderButton("backspace", "⌫", "Delete the previous character", "control")}
          {renderButton("clear", "Clear", "Clear the sentence", "control")}
          {renderButton("speak", "Speak", "Speak the sentence aloud", "control")}
        </div>
      )}

      <p role="status" aria-live="polite" style={styles.status}>{announcement}</p>
    </section>
  );
}
