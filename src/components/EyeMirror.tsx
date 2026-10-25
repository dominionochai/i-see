'use client';

import { useEffect, useRef, useState } from 'react';
import { useGaze, type GazePosition } from '@/lib/gazeContext';
import { useIrisStore } from '@/store/useIrisStore';
import { loadOpenCv, type OpenCv } from '@/lib/opencvVision';
import { createCropScratch, fitEyePupils } from '@/lib/pupilTracking';

const CANVAS_SIZE = 384;
/** Pupil fitting is a visual extra; running it at ~12 Hz keeps the page light. */
const PUPIL_FIT_INTERVAL_MS = 80;
const DRAW_INTERVAL_MS = 33;
const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

/** A pupil ellipse in mirror-canvas pixels, ready to draw. */
interface CanvasEllipse {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
}

/** Maps a point normalised to the unmirrored camera frame onto the mirrored, cover-cropped canvas. */
function makeProjector(video: HTMLVideoElement, width: number, height: number) {
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const sourceX = (video.videoWidth - width / scale) / 2;
  const sourceY = (video.videoHeight - height / scale) / 2;
  return {
    scale,
    point: (p: GazePosition): GazePosition => ({
      x: width - (p.x * video.videoWidth - sourceX) * scale,
      y: (p.y * video.videoHeight - sourceY) * scale,
    }),
  };
}

export function EyeMirror() {
  // Opened from the toolbar; the same toggle closes it.
  const isOpen = useIrisStore((state) => state.showEyeMirror);
  const toggleMirror = useIrisStore((state) => state.toggleEyeMirror);
  const [openCvReady, setOpenCvReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stream, overlayRef, gazePositionRef, isFaceDetected, isTracking } = useGaze();

  // Keep the shortcut local to the visible mirror; it neither prevents the
  // default nor stops propagation, so other page shortcuts keep working.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key.toLowerCase() !== 'm' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || typing) return;
      toggleMirror();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, toggleMirror]);

  // Load OpenCV only while the mirror is open; the app works without it.
  const cvRef = useRef<OpenCv | null>(null);
  useEffect(() => {
    if (!isOpen || cvRef.current) return;
    let cancelled = false;
    loadOpenCv()
      .then((cv) => {
        if (cancelled) return;
        cvRef.current = cv;
        setOpenCvReady(true);
      })
      .catch((error: unknown) => console.warn('OpenCV unavailable; pupil ellipses disabled.', error));
    return () => { cancelled = true; };
  }, [isOpen]);

  // Draw from the provider's camera stream and high-frequency refs; reading
  // refs inside requestAnimationFrame avoids a React render per frame.
  useEffect(() => {
    if (!isOpen) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!video || !canvas || !context) return;

    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);

    const scratch = createCropScratch();
    let ellipses: CanvasEllipse[] = [];
    let lastFit = 0;
    let lastDraw = 0;
    let animationFrame = 0;

    /** Fits pupils on the unmirrored video, then maps them onto the mirrored canvas. */
    const fitPupils = (projector: ReturnType<typeof makeProjector>): CanvasEllipse[] => {
      const cv = cvRef.current;
      if (!cv || !scratch) return [];
      return fitEyePupils(cv, video, overlayRef.current.eyes, scratch).map(({ pupil }) => ({
        ...projector.point({ x: pupil.cx, y: pupil.cy }),
        radiusX: pupil.rx * video.videoWidth * projector.scale,
        radiusY: pupil.ry * video.videoWidth * projector.scale,
        rotation: -(pupil.angleDeg * Math.PI) / 180, // mirroring reverses rotation
      }));
    };

    const draw = (time: number) => {
      animationFrame = window.requestAnimationFrame(draw);
      if (time - lastDraw < DRAW_INTERVAL_MS) return;
      lastDraw = time;

      const { width, height } = canvas;
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 2;
      const hasFrame = Boolean(stream) && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0;

      context.clearRect(0, 0, width, height);
      context.save();
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.clip();
      context.fillStyle = '#071018';
      context.fillRect(0, 0, width, height);

      if (hasFrame) {
        const projector = makeProjector(video, width, height);
        const sourceWidth = width / projector.scale;
        const sourceHeight = height / projector.scale;
        const sourceX = (video.videoWidth - sourceWidth) / 2;
        const sourceY = (video.videoHeight - sourceHeight) / 2;

        // Selfie mirror: flip the live image horizontally.
        context.save();
        context.translate(width, 0);
        context.scale(-1, 1);
        context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
        context.restore();

        const vignette = context.createRadialGradient(cx, cy, radius * 0.22, cx, cy, radius);
        vignette.addColorStop(0, 'rgba(3, 10, 17, 0.02)');
        vignette.addColorStop(1, 'rgba(3, 10, 17, 0.72)');
        context.fillStyle = vignette;
        context.fillRect(0, 0, width, height);

        const eyes = overlayRef.current.eyes;
        if (isFaceDetected && eyes.length > 0) {
          if (time - lastFit >= PUPIL_FIT_INTERVAL_MS) {
            lastFit = time;
            ellipses = fitPupils(projector);
          }

          // Eyelid outlines from the face tracker.
          context.strokeStyle = 'rgba(165, 243, 252, 0.55)';
          context.lineWidth = 1.5;
          for (const eye of eyes) {
            context.beginPath();
            eye.contour.forEach((p, i) => {
              const { x, y } = projector.point(p);
              if (i === 0) context.moveTo(x, y);
              else context.lineTo(x, y);
            });
            context.closePath();
            context.stroke();
          }

          // OpenCV pupil ellipses.
          context.strokeStyle = 'rgba(252, 211, 77, 0.95)';
          context.lineWidth = 2;
          for (const e of ellipses) {
            context.beginPath();
            context.ellipse(e.x, e.y, Math.max(1, e.radiusX), Math.max(1, e.radiusY), e.rotation, 0, Math.PI * 2);
            context.stroke();
          }

          // Iris centres and the gaze ray toward the on-screen cursor.
          const irises = eyes.map((eye) => projector.point(eye.iris));
          const origin = {
            x: irises.reduce((sum, p) => sum + p.x, 0) / irises.length,
            y: irises.reduce((sum, p) => sum + p.y, 0) / irises.length,
          };
          if (isTracking && window.innerWidth > 0 && window.innerHeight > 0) {
            const gaze = gazePositionRef.current;
            const targetX = clampUnit(gaze.x / window.innerWidth) * width;
            const targetY = clampUnit(gaze.y / window.innerHeight) * height;
            const angle = Math.atan2(targetY - origin.y, targetX - origin.x);
            const headLength = 11;
            context.strokeStyle = 'rgba(103, 232, 249, 0.95)';
            context.fillStyle = 'rgba(103, 232, 249, 0.95)';
            context.lineWidth = 2.5;
            context.lineCap = 'round';
            context.beginPath();
            context.moveTo(origin.x, origin.y);
            context.lineTo(targetX, targetY);
            context.stroke();
            context.beginPath();
            context.moveTo(targetX, targetY);
            context.lineTo(targetX - headLength * Math.cos(angle - Math.PI / 6), targetY - headLength * Math.sin(angle - Math.PI / 6));
            context.lineTo(targetX - headLength * Math.cos(angle + Math.PI / 6), targetY - headLength * Math.sin(angle + Math.PI / 6));
            context.closePath();
            context.fill();
          }

          context.shadowColor = 'rgba(103, 232, 249, 0.95)';
          context.shadowBlur = 16;
          context.fillStyle = '#67e8f9';
          for (const p of irises) {
            context.beginPath();
            context.arc(p.x, p.y, 4, 0, Math.PI * 2);
            context.fill();
          }
          context.shadowBlur = 0;
        } else {
          ellipses = [];
        }
      }
      context.restore();
    };

    animationFrame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [isOpen, stream, overlayRef, gazePositionRef, isFaceDetected, isTracking, openCvReady]);

  return (
    <div className="fixed bottom-5 left-5 z-[70]">
      {isOpen ? (
        <section
          aria-label="Live eye mirror"
          className="w-[min(19rem,calc(100vw-2.5rem))] rounded-[1.75rem] border-4 border-[var(--ink)] bg-white p-4 text-[var(--ink)] shadow-[6px_6px_0_var(--ink)]"
        >
          <header className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--btn-purple)]">i-see · Live view</p>
              <h2 className="mt-0.5 text-sm font-black text-[var(--ink)]">Eye mirror</h2>
            </div>
            <button
              type="button"
              aria-label="Close eye mirror"
              aria-pressed={isOpen}
              onClick={toggleMirror}
              className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--ink)] bg-white text-lg font-black text-[var(--ink)] shadow-[0_2px_0_var(--ink)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--btn-purple)]/40"
            >
              ×
            </button>
          </header>

          <div className="relative mx-auto aspect-square w-full max-w-[15rem] rounded-full border border-cyan-100/20 bg-slate-900 p-[5px] shadow-[0_0_32px_rgba(34,211,238,0.10)]">
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              aria-label="Mirrored live camera with eye, pupil and gaze direction markers"
              className="h-full w-full rounded-full"
            />
            <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
            {!stream && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-slate-950/35 px-8 text-center text-[11px] leading-relaxed text-slate-300">
                Camera is waiting to start
              </div>
            )}
            {stream && !isFaceDetected && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-slate-950/25 px-8 text-center text-[11px] leading-relaxed text-slate-200">
                Looking for your eyes…
              </div>
            )}
          </div>

          <footer className="mt-3 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em]">
            <span className="flex items-center gap-2 text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${isTracking ? 'bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.9)]' : 'bg-slate-600'}`} />
              {isTracking ? 'Tracking' : stream ? 'Searching' : 'Offline'}
            </span>
            <span className="text-slate-500">{openCvReady ? 'OpenCV 5 · ' : ''}M · close</span>
          </footer>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-hidden="true"
            tabIndex={-1}
            className="pointer-events-none absolute h-px w-px opacity-0"
          />
        </section>
      ) : null}
    </div>
  );
}
