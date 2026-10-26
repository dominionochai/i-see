"use client";

import { useEffect, useRef } from "react";
import { GazeProvider, useGaze } from "@/components/GazeProvider";

function GazeDemo() {
  const { stream, gaze, blinkCount, status, startGaze, stopGaze, startCalibration } = useGaze();
  const previewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = previewRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);

  const statusText: Record<typeof status, string> = {
    idle: "Camera is idle",
    starting: "Starting camera and face tracking…",
    ready: "Gaze tracking is ready",
    error: "Gaze tracking failed",
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">I-See · Gaze tracking</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Camera gaze demo</h1>
          <p className="mt-3 max-w-2xl text-slate-300">Allow camera access to preview your gaze estimate. Video stays in your browser and is not uploaded.</p>
        </header>

        <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" aria-label="Camera gaze preview">
          <div className="relative aspect-video w-full overflow-hidden bg-slate-800">
            {stream ? (
              <video
                ref={previewRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
                style={{ transform: "scaleX(-1)" }}
                aria-label="Live camera preview"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center px-6 text-center text-slate-300">
                <p>Camera preview will appear here when tracking starts.</p>
              </div>
            )}
            {gaze && (
              <div
                className="pointer-events-none absolute z-10 h-8 w-8 rounded-full border-2 border-white bg-cyan-400/80 shadow-[0_0_24px_8px_rgba(34,211,238,0.8)]"
                style={{ left: `${gaze.x * 100}%`, top: `${gaze.y * 100}%`, transform: "translate(-50%, -50%)" }}
                aria-label={`Gaze position ${Math.round(gaze.x * 100)} percent across, ${Math.round(gaze.y * 100)} percent down`}
              />
            )}
            <div className="pointer-events-none absolute inset-0 border border-white/10" />
          </div>

          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div aria-live="polite">
              <p className="font-semibold">{statusText[status]}</p>
              <p className="mt-1 text-sm text-slate-300">Blinks: {blinkCount}{gaze ? ` · Gaze: ${gaze.x.toFixed(3)}, ${gaze.y.toFixed(3)}` : " · Waiting for face landmarks"}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {status === "idle" || status === "error" ? (
                <button type="button" onClick={() => void startGaze()} className="rounded-lg bg-cyan-400 px-4 py-2 font-bold text-slate-950 hover:bg-cyan-300">Start camera</button>
              ) : (
                <button type="button" onClick={stopGaze} className="rounded-lg border border-slate-500 px-4 py-2 font-semibold hover:bg-slate-800">Stop camera</button>
              )}
              <button type="button" onClick={startCalibration} className="rounded-lg border border-cyan-300 px-4 py-2 font-semibold text-cyan-200 hover:bg-cyan-950">Calibrate center</button>
            </div>
          </div>
        </section>
        <p className="mt-4 text-sm text-slate-400">Status: {status}. Calibration centers your current gaze estimate; blink detection uses eyelid aspect ratio.</p>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <GazeProvider autoStart>
      <GazeDemo />
    </GazeProvider>
  );
}
