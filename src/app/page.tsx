"use client";

import { useEffect, useRef, useState } from "react";
import { useIrisStore } from "@/store/useIrisStore";
import { GridUI } from "@/components/GridUI";
import { NodeBuilder } from "@/components/NodeBuilder";
import { useWhisperMic } from "@/hooks/useWhisperMic";
import { GazeProvider } from "@/components/GazeProvider";
import { useGaze } from "@/lib/gazeContext";
import { GazeCursor } from "@/components/GazeCursor";
import { CalibrationOverlay } from "@/components/CalibrationOverlay";
import { LandingPage } from "@/components/LandingPage";
import { EyeMirror } from "@/components/EyeMirror";
import MindReaderKeyboard from "@/components/MindReaderKeyboard";
import { GazeButton } from "@/components/GazeButton";
import { AgentProvider } from "@/components/AgentProvider";
import { ContactsPanel } from "@/components/ContactsPanel";
import type { FeaturePanel } from "@/lib/panels";
import { SocialPanel } from "@/components/social/SocialPanel";
import { SceneVision } from "@/components/SceneVision";
import { XRayView } from "@/components/XRayView";
import GazeModeToggle from "./components/GazeModeToggle";

const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)));
};

function AppContent() {
  const { appStage, sttReady, sttDownloadProgress, liveCaption, sttError } = useIrisStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mindReaderOpen, setMindReaderOpen] = useState(false);
  const [panel, setPanel] = useState<Exclude<FeaturePanel, "keyboard"> | null>(null);
  /** Set when a contact's conversation should open straight away. */
  const [socialThread, setSocialThread] = useState<string | undefined>();
  const closePanel = () => setPanel(null);
  useEffect(() => { (window as unknown as Record<string, unknown>).__iris = useIrisStore; }, []);

  const openPanel = (next: FeaturePanel) => {
    if (next === "keyboard") {
      setMindReaderOpen(true);
      return;
    }
    if (next === "social") setSocialThread(undefined);
    setPanel(next);
  };
  const openConversation = (contactId: string) => {
    setSocialThread(contactId);
    setPanel("social");
  };

  // Use the stream provided by the eye tracker
  const { stream, startCalibration } = useGaze();

  // Wire whisper mic to the eye tracker's stream
  useWhisperMic(stream);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, appStage]);

  // Recenter keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        useIrisStore.getState().triggerRecenter();
      } else if (e.code === 'KeyC') {
        startCalibration();
      } else if (e.code === 'KeyX' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        // Opens the X-ray view; the view itself closes on X.
        setPanel((current) => current ?? 'xray');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--iris-bg)] text-[var(--iris-text)] relative pt-12">
      {appStage === 'landing' && <LandingPage />}

      {appStage !== 'landing' && <CalibrationOverlay />}

      {appStage === 'project' && (
        <>
          {/* Video Preview — light theme card */}
          <div className="fixed bottom-4 right-4 w-64 h-48 rounded-2xl z-50 overflow-hidden bg-[var(--iris-surface)]" style={{ boxShadow: "var(--shadow-elevated)" }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover opacity-90 [transform:scaleX(-1)]"
            />
            {sttError && (
              <div className="absolute inset-0 bg-[var(--iris-danger)]/90 flex flex-col items-center justify-center p-3 text-center">
                <span className="text-white font-semibold text-xs mb-1">WHISPER ERROR</span>
                <span className="text-white/90 text-[10px] leading-tight truncate w-full">{sttError}</span>
              </div>
            )}
            {!sttReady && !sttError && (
              <div className="absolute bottom-0 left-0 w-full h-6 bg-[var(--iris-surface-raised)]/90 flex items-center justify-center border-t border-[var(--iris-border)]">
                <div
                  className="absolute left-0 top-0 h-full transition-all duration-300"
                  style={{ width: `${sttDownloadProgress}%`, background: "var(--iris-accent)", opacity: 0.2 }}
                />
                <span className="relative z-10 text-[10px] font-bold tracking-widest text-[var(--iris-text-muted)]">
                  WHISPER {sttDownloadProgress}%
                </span>
              </div>
            )}
            {sttReady && liveCaption && !sttError && (
              <div className="absolute bottom-0 left-0 w-full min-h-[20%] bg-[var(--iris-surface)]/90 flex items-center justify-center p-2 border-t border-[var(--iris-border)]">
                <span className="text-sm font-bold text-[var(--iris-accent)] text-center leading-snug tracking-wide">
                  {liveCaption}
                </span>
              </div>
            )}
            {/* Blank Audio Fallback Placeholder text */}
            {sttReady && !liveCaption && !sttError && (
              <div className="absolute bottom-0 left-0 w-full h-6 bg-[var(--iris-surface-hover)]/90 flex items-center justify-center border-t border-[var(--iris-border)]">
                <span className="text-[var(--iris-text-muted)] font-bold text-[10px] tracking-widest">[BLANK_AUDIO]</span>
              </div>
            )}
          </div>

          <NodeBuilder />

          <div className="flex-1 min-h-0 w-full h-full z-10 relative">
            <GridUI onOpenPanel={openPanel} />
          </div>

          <EyeMirror />

          <GazeButton
            id="open-mind-reader-keyboard"
            customDwellTime={800}
            className="!fixed bottom-24 right-4 z-[70] h-20 w-48 rounded-xl bg-[var(--iris-accent)] text-white shadow-xl sm:bottom-5"
            text={mindReaderOpen ? "CLOSE GAZE KEYBOARD" : "OPEN GAZE KEYBOARD"}
            onClick={() => setMindReaderOpen((open) => !open)}
          />

          {mindReaderOpen && (
            <div
              id="mind-reader-keyboard-panel"
              role="region"
              aria-label="Gaze keyboard"
              className="fixed bottom-48 right-4 z-[810] max-h-[calc(100vh-13rem)] w-[min(820px,calc(100vw-2rem))] overflow-y-auto rounded-2xl sm:bottom-[7.5rem] sm:max-h-[calc(100vh-9.5rem)]"
            >
              <MindReaderKeyboard />
            </div>
          )}

          {panel === "contacts" && <ContactsPanel onClose={closePanel} onMessage={openConversation} />}
          {panel === "social" && (
            <SocialPanel
              key={socialThread ?? "feed"}
              onClose={closePanel}
              initialTab={socialThread ? "messages" : "feed"}
              initialThread={socialThread}
            />
          )}
          {panel === "scene" && <SceneVision onClose={closePanel} />}
          <GazeModeToggle />
          {panel === "xray" && <XRayView onClose={closePanel} />}
        </>
      )}

      <GazeCursor />
    </main>
  );
}

export default function Home() {
  return (
    <GazeProvider>
      <AgentProvider>
        <AppContent />
      </AgentProvider>
    </GazeProvider>
  );
}
