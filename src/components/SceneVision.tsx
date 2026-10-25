"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GazeAction, GazeSelectScope } from "@/components/GazeSelectScope";
import { brutal } from "@/components/ui/brutal";
import { useSceneFrame } from "@/hooks/useSceneFrame";
import { useGaze } from "@/lib/gazeContext";
import { focusBox, pointInRect, type NormalizedBox } from "@/lib/sceneMapping";
import type { VisionResult } from "@/lib/vision";
import { ttsService } from "@/utils/ttsService";

const CROP_MAX_PX = 384;
const CONTEXT_MAX_PX = 512;
const JPEG_QUALITY = 0.85;

type Phase =
  | { name: "idle" }
  | { name: "identifying"; box: NormalizedBox }
  | { name: "result"; box: NormalizedBox; result: VisionResult }
  | { name: "error"; message: string };

/** Draws part of an image to a canvas, scaled to fit `maxSide`, and returns its JPEG as base64. */
function encodeRegion(image: HTMLImageElement, box: NormalizedBox, maxSide: number): string {
  const sx = box.x * image.naturalWidth;
  const sy = box.y * image.naturalHeight;
  const sw = box.width * image.naturalWidth;
  const sh = box.height * image.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext("2d")?.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1] ?? "";
}

const FULL_FRAME: NormalizedBox = { x: 0, y: 0, width: 1, height: 1 };

async function identify(image: HTMLImageElement, box: NormalizedBox): Promise<VisionResult> {
  const response = await fetch("/api/vision/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      focus: { data: encodeRegion(image, box, CROP_MAX_PX), mimeType: "image/jpeg" },
      context: { data: encodeRegion(image, FULL_FRAME, CONTEXT_MAX_PX), mimeType: "image/jpeg" },
    }),
  });
  const body = (await response.json().catch(() => null)) as (VisionResult & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? `Vision request failed (${response.status}).`);
  return body;
}

const percent = (value: number) => `${value * 100}%`;

/**
 * Look at something in the live room view and blink: the app names it and
 * proposes what you probably want to say. The glowing outline is a highlight of
 * the region that was sent to the vision model, not an object segmentation.
 */
export function SceneVision({ onClose }: { onClose: () => void }) {
  const { gazePositionRef, blinkCount } = useGaze();
  const { src, source, setUpload } = useSceneFrame();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lastBlinkRef = useRef(blinkCount);
  const busyRef = useRef(false);

  const identifyAt = useCallback(async (u: number, v: number) => {
    const image = imageRef.current;
    if (!image || !image.naturalWidth || busyRef.current) return;
    busyRef.current = true;
    const box = focusBox(u, v, image.naturalWidth / image.naturalHeight);
    setPhase({ name: "identifying", box });
    try {
      setPhase({ name: "result", box, result: await identify(image, box) });
    } catch (error) {
      setPhase({ name: "error", message: error instanceof Error ? error.message : "Could not identify that." });
    } finally {
      busyRef.current = false;
    }
  }, []);

  // A blink while looking at the image identifies whatever is under the gaze.
  useEffect(() => {
    if (blinkCount > lastBlinkRef.current && frameRef.current) {
      const { x, y } = gazePositionRef.current;
      const hit = pointInRect(x, y, frameRef.current.getBoundingClientRect());
      if (hit) void identifyAt(hit.u, hit.v);
    }
    lastBlinkRef.current = blinkCount;
  }, [blinkCount, gazePositionRef, identifyAt]);

  const clickToIdentify = (event: React.MouseEvent) => {
    const hit = frameRef.current && pointInRect(event.clientX, event.clientY, frameRef.current.getBoundingClientRect());
    if (hit) void identifyAt(hit.u, hit.v);
  };

  const result = phase.name === "result" ? phase.result : null;
  const box = phase.name === "identifying" || phase.name === "result" ? phase.box : null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <GazeSelectScope modal label="Scene vision" className={brutal.panel}>
      <header className={brutal.header}>
        <h2 className={brutal.title}>Look &amp; say</h2>
        <p className={brutal.subtitle}>Look at something in the room and blink.</p>
        <div className="ml-auto flex items-center gap-2">
          {source === "upload" && (
            <GazeAction id="clear-upload" agent={false} onClick={() => setUpload(null)}
              className={brutal.button}>Use phone camera</GazeAction>
          )}
          <GazeAction id="close-scene" agent={false} onClick={onClose}
            className={brutal.button}>Close ✕</GazeAction>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
        {src ? (
          <div ref={frameRef} onClick={clickToIdentify} className="relative inline-block max-h-[62vh] max-w-full cursor-crosshair overflow-hidden rounded-2xl border-4 border-[var(--ink)] shadow-[6px_6px_0_var(--ink)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- live blob URL, not optimisable */}
            <img ref={imageRef} src={src} alt="Live view of the room" className="block max-h-[62vh] max-w-full select-none" draggable={false} />
            {box && (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute rounded-xl border-[3px] border-[var(--btn-purple)] ${phase.name === "identifying" ? "animate-pulse" : ""}`}
                style={{
                  left: percent(box.x), top: percent(box.y), width: percent(box.width), height: percent(box.height),
                  boxShadow: "0 0 0 3px #fff, 0 0 26px 6px rgba(0,137,123,0.65), inset 0 0 24px rgba(0,137,123,0.3)",
                }}
              >
                <span className="absolute -top-7 left-0 whitespace-nowrap rounded-md border-2 border-[var(--ink)] bg-[var(--cat-yes)] px-2 py-0.5 text-xs font-black text-[var(--ink)]">
                  {result ? `${result.object} · ${result.confidence}` : "Looking…"}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className={`max-w-md space-y-4 p-6 text-center text-sm ${brutal.card} ${brutal.muted}`}>
            <p className="text-lg font-black text-[var(--ink)]">Waiting for a camera</p>
            <p>On your phone, open <span className="break-all font-mono font-bold text-[var(--btn-purple)]">{origin}/phone</span> and point it at your table.</p>
            <p className="text-[var(--iris-text-muted)]">No camera on the phone page? Use a photo instead:</p>
            <input type="file" accept="image/*" aria-label="Choose a photo of the scene"
              onChange={(event) => setUpload(event.target.files?.[0] ?? null)}
              className="block w-full text-xs file:mr-3 file:rounded-lg file:border-2 file:border-[var(--ink)] file:bg-[var(--cat-yes)] file:px-3 file:py-2 file:font-bold file:text-[var(--ink)]" />
          </div>
        )}

        {phase.name === "error" && (
          <p role="alert" className="max-w-xl rounded-xl border-[3px] border-[var(--ink)] bg-[var(--cat-no)] px-4 py-2 text-sm font-bold text-white">{phase.message}</p>
        )}

        {result && (
          <section aria-label="What you might want to say" className={`w-full max-w-2xl space-y-3 ${brutal.card}`}>
            <p className="text-2xl font-black leading-snug">“{result.sentence}”</p>
            <div className="flex flex-wrap items-center gap-2">
              <GazeAction id="speak-result" agent={false} onClick={() => void ttsService.speak(result.sentence)}
                className={brutal.buttonPrimary}>🔊 Speak</GazeAction>
              {result.alternatives.map((alternative) => (
                <GazeAction key={alternative} id={`alt-${alternative}`} agent={false} onClick={() => void ttsService.speak(alternative)}
                  className={brutal.button}>{alternative}</GazeAction>
              ))}
              <GazeAction id="dismiss-result" agent={false} onClick={() => setPhase({ name: "idle" })}
                className={`ml-auto ${brutal.button}`}>Dismiss</GazeAction>
            </div>
          </section>
        )}
      </div>
    </GazeSelectScope>
  );
}
