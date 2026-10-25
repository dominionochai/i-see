"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FRAME_INTERVAL_MS = 500;
const FRAME_WIDTH_PX = 640;
const JPEG_QUALITY = 0.6;

type Status = "idle" | "streaming" | "error";

/** Draws a source onto a scaled canvas and returns it as a JPEG blob. */
function toJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, FRAME_WIDTH_PX / width);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

async function upload(blob: Blob) {
  const response = await fetch("/api/scene/frame", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
  if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
}

/**
 * Phone page: streams the rear camera to the laptop's scene view. Live video
 * needs a secure context (HTTPS); on plain HTTP, the photo button still works.
 */
export default function PhonePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStatus("idle");
  }, []);

  const start = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setMessage("Live camera needs HTTPS. Run `npm run dev:https` on the laptop and open the https address, or use the photo button below.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("streaming");
      setMessage("");
    } catch {
      setStatus("error");
      setMessage("Camera permission was denied.");
    }
  };

  useEffect(() => {
    if (status !== "streaming") return;
    let busy = false;
    const timer = setInterval(async () => {
      const video = videoRef.current;
      if (busy || !video || video.videoWidth === 0) return;
      busy = true;
      try {
        const blob = await toJpeg(video, video.videoWidth, video.videoHeight);
        if (blob) await upload(blob);
        setMessage("");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not reach the laptop.");
      } finally {
        busy = false;
      }
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => stop, [stop]);

  const sendPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const blob = await toJpeg(bitmap, bitmap.width, bitmap.height);
      if (blob) await upload(blob);
      setMessage("Photo sent to the laptop.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the photo.");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-[var(--iris-bg)] p-4 text-[var(--ink)]">
      <h1 className="text-2xl font-black uppercase">i-see scene camera</h1>
      <p className="text-sm text-[var(--iris-text-secondary)]">Point this at your table. It appears in “Look &amp; say” on the laptop.</p>

      <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full rounded-2xl border-4 border-[var(--ink)] bg-black object-cover shadow-[6px_6px_0_var(--ink)]" />

      {status === "streaming" ? (
        <button type="button" onClick={stop} className="rounded-xl border-[3px] border-[var(--ink)] bg-[var(--cat-no)] px-4 py-3 font-black text-white shadow-[0_4px_0_var(--ink)]">Stop streaming</button>
      ) : (
        <button type="button" onClick={start} className="rounded-xl border-[3px] border-[var(--ink)] bg-[var(--btn-purple)] px-4 py-3 font-black text-white shadow-[0_4px_0_var(--ink)]">Start live camera</button>
      )}

      <label className="rounded-xl border-[3px] border-[var(--ink)] bg-white px-4 py-3 text-center text-sm font-bold shadow-[0_4px_0_var(--ink)]">
        Take or choose a photo
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => void sendPhoto(event.target.files?.[0])} />
      </label>

      {message && <p role="status" className={`text-sm ${status === "error" ? "text-[var(--cat-no)]" : "text-[var(--iris-text-secondary)]"}`}>{message}</p>}
    </main>
  );
}
