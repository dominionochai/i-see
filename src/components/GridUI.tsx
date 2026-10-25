"use client";

import { useState, useEffect } from "react";
import { useIrisStore } from "@/store/useIrisStore";
import { GazeButton } from "./GazeButton";
import { SpeakHandler } from "./SpeakHandler";
import { Hand, Smile, Activity, Check, X, Utensils, CupSoda, Tv, RefreshCcw, Moon, AlertTriangle, Settings, Music, Power, MessageCircle, Bath, Wind, Lightbulb, Thermometer, Users, MessagesSquare, ScanEye, Radar, Keyboard } from "lucide-react";
import type { FeaturePanel } from "@/lib/panels";
import { StatusBar } from "./StatusBar";

/** Tiles that open the app's feature panels. They form the grid's last row. */
const FEATURE_TILES: ReadonlyArray<{
  panel: FeaturePanel;
  text: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  textColor: string;
}> = [
  { panel: "social", text: "SOCIAL MEDIA", icon: MessagesSquare, accent: "var(--cat-music)", textColor: "black" },
  { panel: "scene", text: "LOOK & SAY", icon: ScanEye, accent: "var(--cat-reoptimize)", textColor: "black" },
  { panel: "xray", text: "X-RAY", icon: Radar, accent: "var(--cat-sleep)", textColor: "white" },
  { panel: "keyboard", text: "KEYBOARD", icon: Keyboard, accent: "var(--cat-entertainment)", textColor: "white" },
];

/** Category config: icon + CSS custom property accent color */
const CATEGORY_MAP: Record<string, { icon: React.ComponentType<{ className?: string }>; accent: string }> = {
  "Physical":           { icon: Hand,       accent: "var(--cat-physical)" },
  "Social":             { icon: Smile,      accent: "var(--cat-social)" },
  "Pain":               { icon: Activity,   accent: "var(--cat-pain)" },
  "Yes":                { icon: Check,      accent: "var(--cat-yes)" },
  "No":                 { icon: X,          accent: "var(--cat-no)" },
  "Hungry":             { icon: Utensils,   accent: "var(--cat-hungry)" },
  "Thirsty":            { icon: CupSoda,    accent: "var(--cat-thirsty)" },
  "Toilet":             { icon: Bath,       accent: "var(--cat-toilet)" },
  "Entertainment":      { icon: Tv,         accent: "var(--cat-entertainment)" },
  "Sleep Mode":         { icon: Moon,       accent: "var(--cat-sleep)" },
  "Re-Optimize Layout": { icon: RefreshCcw, accent: "var(--cat-reoptimize)" },
  "Music":              { icon: Music,      accent: "var(--cat-music)" },
  "Environment":        { icon: Thermometer,accent: "var(--cat-environment)" },
};

const PREDICTION_ACCENTS = [
  "var(--pred-speech)",
  "var(--pred-error)",
  "var(--pred-retry)",
];

export function GridUI({ onOpenPanel }: { onOpenPanel: (panel: FeaturePanel) => void }) {
  const {
    selectedNodes, predictions, isPredicting, coreBlocks,
    activeTone, sleepMode, showMediaModal, showEnvironmentModal, isTranscribing,
    isDebugMode, toggleDebugMode, isContextResponse, showEyeMirror, toggleEyeMirror,
    generatedSpeech, ambientContext
  } = useIrisStore();

  const toneModifiers = ["Sarcastic", "Urgent", "Polite", "Joyful"];

  return (
    <>
      {/* ── Floating Toolbar ── */}
      <div className="fixed top-4 left-4 z-[9999] flex gap-2">
          <button
            onClick={toggleDebugMode}
            className="px-4 py-1.5 rounded-lg text-[11px] font-bold tracking-wider border-2 border-[var(--ink)] bg-white text-[var(--ink)] shadow-[0_3px_0_var(--ink)] active:translate-y-[3px] active:shadow-none transition-all"
          >
            DEBUG {isDebugMode ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => useIrisStore.getState().triggerRecenter()}
            className="px-4 py-1.5 rounded-lg text-[11px] font-bold tracking-wider border-2 border-[var(--ink)] bg-white text-[var(--ink)] shadow-[0_3px_0_var(--ink)] active:translate-y-[3px] active:shadow-none transition-all"
          >
            RE-CENTER (C)
          </button>
          <button
            onClick={toggleEyeMirror}
            aria-pressed={showEyeMirror}
            className="px-4 py-1.5 rounded-lg text-[11px] font-bold tracking-wider border-2 border-[var(--ink)] bg-white text-[var(--ink)] shadow-[0_3px_0_var(--ink)] active:translate-y-[3px] active:shadow-none transition-all"
          >
            EYE MIRROR
          </button>
        <div className="mx-2 w-px h-6 bg-[var(--iris-border)] opacity-50 self-center" />
        <StatusBar />
      </div>

      {/* ── Transcribing Banner ── */}
      {isTranscribing && (
        <div className="fixed top-0 left-1/2 -translate-x-1/2 z-[9999] bg-[#d97706] shadow-lg rounded-b-2xl px-10 py-2.5 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-white animate-[iris-pulse_1s_ease-in-out_infinite]" />
          <span className="text-sm font-bold tracking-wide text-white">Transcribing...</span>
        </div>
      )}

      {/* ── Sleep Mode Overlay ── */}
      {sleepMode && (
        <div className="fixed inset-0 bg-black/95 z-[9000] flex items-center justify-center">
          <GazeButton
            id="wake-block"
            customDwellTime={3000}
            icon={Power}
            className="w-56 h-56"
            accentColor="var(--iris-accent)"
            text="WAKE"
          />
        </div>
      )}
      {/* ── Environment Modal ── */}
      {showEnvironmentModal && (
        <div className="fixed inset-0 bg-[var(--iris-bg)] z-[8000] flex flex-col p-8 md:p-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-widest text-[var(--ink)]">Environment Controls</h2>
            <GazeButton
              id="close-env-modal"
              customDwellTime={800}
              icon={X}
              className="w-32 h-16 !bg-[var(--cat-no)]"
              accentColor="var(--cat-no)"
              text="CLOSE"
            />
          </div>
          <div className="grid grid-cols-2 gap-8 flex-1">
            <GazeButton
              id="env-fan-on"
              customDwellTime={1500}
              icon={Wind}
              className="w-full h-full text-4xl"
              accentColor="var(--cat-social)"
              text="FAN ON"
              onClick={() => fetch("/api/room-action", { method: "POST", body: JSON.stringify({ device: "fan", state: "ON" }) })}
            />
            <GazeButton
              id="env-fan-off"
              customDwellTime={1500}
              icon={Wind}
              className="w-full h-full text-4xl"
              accentColor="var(--cat-pain)"
              text="FAN OFF"
              onClick={() => fetch("/api/room-action", { method: "POST", body: JSON.stringify({ device: "fan", state: "OFF" }) })}
            />
            <GazeButton
              id="env-light-on"
              customDwellTime={1500}
              icon={Lightbulb}
              className="w-full h-full text-4xl"
              accentColor="var(--cat-yes)"
              text="LIGHT ON"
              onClick={() => fetch("/api/room-action", { method: "POST", body: JSON.stringify({ device: "light", state: "ON" }) })}
            />
            <GazeButton
              id="env-light-off"
              customDwellTime={1500}
              icon={Lightbulb}
              className="w-full h-full text-4xl"
              accentColor="var(--cat-no)"
              text="LIGHT OFF"
              onClick={() => fetch("/api/room-action", { method: "POST", body: JSON.stringify({ device: "light", state: "OFF" }) })}
            />
          </div>
        </div>
      )}

      {/* ── Media Modal ── */}
      {showMediaModal && (
        <div className="fixed inset-0 bg-black/90 z-[8000] flex items-center justify-center p-12">
          <div className="w-full h-full rounded-2xl overflow-hidden relative flex flex-col bg-white">
            <GazeButton
              id="close-modal"
              customDwellTime={800}
              icon={X}
              className="absolute top-4 right-4 w-32 h-14 z-10 !bg-[var(--btn-red)] !border-black/20 text-white shadow-sm"
              accentColor="rgba(0,0,0,0.1)"
              text="Close"
            />
            <iframe
              className="w-full h-full pointer-events-auto"
              src="https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1"
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* ── Centered Response Overlay (Full Screen) ── */}
      {isContextResponse && (
        <div className="fixed inset-0 bg-[#FFF0F5] z-[10000] flex flex-col items-center justify-center p-24">
          {useIrisStore.getState().ambientContext && (
            <div className="mb-12 bg-white px-8 py-4 rounded-2xl border-[4px] border-[var(--ink)] shadow-[8px_8px_0_0_var(--ink)]">
              <p className="text-4xl font-bold text-[var(--ink)]">
                Heard: "{useIrisStore.getState().ambientContext}"
              </p>
            </div>
          )}
          <button
            onClick={() => useIrisStore.getState().clearNodes()}
            className="absolute bottom-12 right-12 bg-transparent border border-[#6B4A7A]/30 text-[#6B4A7A] font-bold rounded-lg px-6 py-2 hover:bg-[#6B4A7A]/10 transition-colors"
          >
            Clear Response
          </button>
          <div className="w-full max-w-7xl h-[45vh] flex gap-10 items-stretch">
            {predictions.map((word, index) => (
              <GazeButton
                key={`centered-pred-${word}-${index}`}
                id={`pred-${word}`}
                data-block-id={word}
                customDwellTime={1500}
                className="flex-1 h-full !rounded-[40px] shadow-[0_20px_40px_rgba(0,0,0,0.1)] border-b-8 border-black/10"
                accentColor={PREDICTION_ACCENTS[index % PREDICTION_ACCENTS.length]}
                text={word}
                textClassName="text-3xl font-bold text-[var(--ink)]"
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Main Layout ── */}
      <div className={`w-full h-full overflow-hidden flex flex-col transition-opacity duration-500 ${isContextResponse ? "opacity-0 pointer-events-none hidden" : ""}`}>
        <div className="flex w-full h-full pt-6">

          {/* ── Left Tone Column ── */}
          <div className="w-40 flex flex-col gap-3 p-4 pr-0">
            <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--iris-text-muted)] text-center mb-1">
              Tone
            </span>
            {toneModifiers.map((tone) => (
              <GazeButton
                key={tone}
                id={`tone-block-${tone}`}
                customDwellTime={600}
                icon={MessageCircle}
                className="h-full w-full"
                accentColor={activeTone === tone ? "#06b6d4" : "#ffffff"}
                textColor="black"
                text={tone}
              />
            ))}
          </div>

          {/* ── Main Grid Area ── */}
          <div className="flex flex-col flex-1 h-full p-4 px-6 overflow-hidden relative">

            <div className="h-[18vh] shrink-0 pb-2 mb-4 flex gap-3 w-full items-stretch">
              {generatedSpeech ? (
                <div className="flex-1 h-full flex flex-col items-center justify-center bg-white rounded-2xl p-4 border-4 border-[var(--ink)] shadow-[0_8px_0_var(--ink)]">
                  <p className="text-3xl font-bold tracking-wide text-[var(--ink)] text-center w-full line-clamp-2">
                    {generatedSpeech.replace(/^["']+|["']+$/g, '')}
                  </p>
                </div>
              ) : isPredicting ? (
                <div className="flex-1 flex gap-3">
                  <div className="h-full w-full rounded-[var(--radius-lg)] iris-shimmer" />
                  <div className="h-full w-full rounded-[var(--radius-lg)] iris-shimmer" style={{ animationDelay: "0.2s" }} />
                  <div className="h-full w-full rounded-[var(--radius-lg)] iris-shimmer" style={{ animationDelay: "0.4s" }} />
                </div>
              ) : (
                <div className="flex-1 flex gap-3">
                  {predictions.map((word, index) => (
                    <GazeButton
                      key={`pred-${word}-${index}`}
                      id={`pred-${word}`}
                      data-block-id={word}
                      customDwellTime={1800}
                      className="h-full w-full"
                      accentColor={PREDICTION_ACCENTS[index % PREDICTION_ACCENTS.length]}
                      text={word}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Bottom padding keeps the last row clear of the fixed Calibrate button. */}
            <div className="flex-1 min-h-0 relative pb-[6.5rem]">
              <div className="grid grid-cols-4 grid-rows-3 h-full w-full gap-8">
                {coreBlocks.map((block, index) => {
                  if (!block) return <div key={`empty-${index}`} className="w-full h-full" />;
                  const isSelected = selectedNodes.includes(block);
                  const cat = CATEGORY_MAP[block];

                  return (
                    <GazeButton
                      key={`core-${block}-${index}`}
                      id={`grid-block-${block}`}
                      data-disabled={isSelected}
                      customDwellTime={1200}
                      icon={cat?.icon}
                      accentColor={cat?.accent}
                      text={block}
                    />
                  );
                })}
                {FEATURE_TILES.map((tile) => (
                  <GazeButton
                    key={tile.panel}
                    id={`feature-${tile.panel}`}
                    customDwellTime={1200}
                    icon={tile.icon}
                    accentColor={tile.accent}
                    textColor={tile.textColor}
                    text={tile.text}
                    onClick={() => onOpenPanel(tile.panel)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Right Action Column ── */}
          <div className="flex flex-col gap-3 w-[22%] h-full p-4 pl-0">
            <div className="h-1/3">
              <SpeakHandler />
            </div>

            <div className="flex gap-3 h-1/3">
              <GazeButton
                id="feature-contacts"
                customDwellTime={1000}
                icon={Users}
                className="flex-1 h-full"
                accentColor="var(--btn-navy)"
                textColor="white"
                text="CONTACTS"
                textClassName="font-bold text-sm tracking-wide w-full text-center whitespace-nowrap leading-snug"
                onClick={() => onOpenPanel("contacts")}
              />
              <GazeButton
                id="grid-block-EMERGENCY"
                customDwellTime={800}
                icon={AlertTriangle}
                className="flex-1 h-full"
                accentColor="#E63946" // bright red
                textColor="black"
                text="EMERGENCY"
                textClassName="font-bold text-sm tracking-wide w-full text-center whitespace-nowrap leading-snug"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
