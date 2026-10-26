"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export type GazePoint = { x: number; y: number };
export type GazeStatus = "idle" | "starting" | "ready" | "error";

export interface GazeContextValue {
  stream: MediaStream | null;
  gaze: GazePoint | null;
  blinkCount: number;
  status: GazeStatus;
  startGaze: () => Promise<void>;
  stopGaze: () => void;
  startCalibration: () => void;
}

interface GazeProviderProps {
  children: ReactNode;
  autoStart?: boolean;
  smoothingFactor?: number;
  deadZone?: number;
}

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const BLINK_EAR_THRESHOLD = 0.19;
const BLINK_EAR_RELEASE = 0.24;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function averageLandmarks(landmarks: Array<{ x: number; y: number }>, indices: number[]): GazePoint {
  const points = indices.map((index) => landmarks[index]);
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function distance2d(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const GazeContext = createContext<GazeContextValue | null>(null);

export function useGaze(): GazeContextValue {
  const value = useContext(GazeContext);
  if (!value) throw new Error("useGaze must be used inside a GazeProvider.");
  return value;
}

export function GazeProvider({ children, autoStart = false, smoothingFactor = 0.4, deadZone = 0.008 }: GazeProviderProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [gaze, setGaze] = useState<GazePoint | null>(null);
  const [blinkCount, setBlinkCount] = useState(0);
  const [status, setStatus] = useState<GazeStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const startInProgressRef = useRef(false);
  const mountedRef = useRef(false);
  const gazeRef = useRef<GazePoint | null>(null);
  const rawGazeRef = useRef<GazePoint | null>(null);
  const calibrationOffsetRef = useRef<GazePoint>({ x: 0, y: 0 });
  const blinkClosedRef = useRef(false);

  const releaseResources = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    const activeStream = streamRef.current;
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      if (videoRef.current.srcObject === activeStream) videoRef.current.srcObject = null;
    }
    activeStream?.getTracks().forEach((track) => track.stop());
    const activeLandmarker = landmarkerRef.current;
    landmarkerRef.current = null;
    try {
      activeLandmarker?.close();
    } catch {
      // The landmarker may already have been closed while an async start was cancelled.
    }
    if (mountedRef.current) setStream(null);
  }, []);

  const stopGaze = useCallback(() => {
    generationRef.current += 1;
    startInProgressRef.current = false;
    releaseResources();
    gazeRef.current = null;
    rawGazeRef.current = null;
    calibrationOffsetRef.current = { x: 0, y: 0 };
    blinkClosedRef.current = false;
    if (mountedRef.current) {
      setGaze(null);
      setStatus("idle");
      setErrorMessage(null);
    }
  }, [releaseResources]);

  const startGaze = useCallback(async () => {
    if (startInProgressRef.current || streamRef.current) return;
    startInProgressRef.current = true;
    const generation = ++generationRef.current;
    if (mountedRef.current) {
      setStatus("starting");
      setErrorMessage(null);
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is unavailable in this browser or page context.");
      }
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (generation !== generationRef.current) {
        cameraStream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = cameraStream;
      if (mountedRef.current) setStream(cameraStream);

      const video = videoRef.current;
      if (!video) throw new Error("The gaze tracking video element is not available.");
      video.srcObject = cameraStream;
      await video.play();

      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      if (generation !== generationRef.current) {
        landmarker.close();
        cameraStream.getTracks().forEach((track) => track.stop());
        return;
      }
      landmarkerRef.current = landmarker;
      if (mountedRef.current) setStatus("ready");

      let lastVideoTime = -1;
      const detectFrame = () => {
        if (generation !== generationRef.current) return;
        const currentVideo = videoRef.current;
        if (currentVideo && currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && currentVideo.videoWidth > 0 && currentVideo.currentTime !== lastVideoTime) {
          try {
            const result = landmarker.detectForVideo(currentVideo, performance.now());
            lastVideoTime = currentVideo.currentTime;
            const landmarks = result.faceLandmarks?.[0];
            // No face or incomplete landmarks means retaining the last stable gaze point.
            if (landmarks && landmarks.length > 477) {
              const leftIris = averageLandmarks(landmarks, [468, 469, 470, 471, 472]);
              const rightIris = averageLandmarks(landmarks, [473, 474, 475, 476, 477]);
              const raw = {
                x: clamp01(1 - (leftIris.x + rightIris.x) / 2),
                y: clamp01((leftIris.y + rightIris.y) / 2),
              };
              rawGazeRef.current = raw;
              const target = {
                x: clamp01(raw.x - calibrationOffsetRef.current.x),
                y: clamp01(raw.y - calibrationOffsetRef.current.y),
              };
              const previous = gazeRef.current;
              const factor = Math.max(0, Math.min(1, smoothingFactor));
              const zone = Math.max(0, deadZone);
              let next = target;
              if (previous) {
                const dx = target.x - previous.x;
                const dy = target.y - previous.y;
                if (Math.abs(dx) <= zone && Math.abs(dy) <= zone) {
                  next = previous;
                } else {
                  next = { x: clamp01(previous.x + dx * factor), y: clamp01(previous.y + dy * factor) };
                }
              }
              if (next !== previous) {
                gazeRef.current = next;
                if (mountedRef.current) setGaze(next);
              }

              // EAR uses the requested upper/lower eyelid landmarks and eye-corner widths.
              const leftWidth = distance2d(landmarks[33], landmarks[133]);
              const rightWidth = distance2d(landmarks[362], landmarks[263]);
              if (leftWidth > 0 && rightWidth > 0) {
                const leftEar = (2 * distance2d(landmarks[159], landmarks[145])) / leftWidth;
                const rightEar = (2 * distance2d(landmarks[386], landmarks[374])) / rightWidth;
                const ear = (leftEar + rightEar) / 2;
                if (ear < BLINK_EAR_THRESHOLD && !blinkClosedRef.current) {
                  blinkClosedRef.current = true;
                  if (mountedRef.current) setBlinkCount((count) => count + 1);
                } else if (ear > BLINK_EAR_RELEASE) {
                  blinkClosedRef.current = false;
                }
              }
            }
          } catch (error) {
            if (generation === generationRef.current) {
              releaseResources();
              startInProgressRef.current = false;
              const message = error instanceof Error ? error.message : "Face landmark detection failed.";
              if (mountedRef.current) {
                setStatus("error");
                setErrorMessage(message);
              }
            }
            return;
          }
        }
        animationFrameRef.current = window.requestAnimationFrame(detectFrame);
      };
      animationFrameRef.current = window.requestAnimationFrame(detectFrame);
    } catch (error) {
      if (generation === generationRef.current) {
        releaseResources();
        startInProgressRef.current = false;
        const message = error instanceof Error ? error.message : "Unable to start gaze tracking.";
        if (mountedRef.current) {
          setStatus("error");
          setErrorMessage(message);
        }
      }
    } finally {
      if (generation === generationRef.current) startInProgressRef.current = false;
    }
  }, [deadZone, releaseResources, smoothingFactor]);

  const startCalibration = useCallback(() => {
    calibrationOffsetRef.current = rawGazeRef.current
      ? { x: rawGazeRef.current.x - 0.5, y: rawGazeRef.current.y - 0.5 }
      : { x: 0, y: 0 };
    gazeRef.current = rawGazeRef.current ? { x: 0.5, y: 0.5 } : null;
    if (mountedRef.current) setGaze(gazeRef.current);
    if (!streamRef.current && !startInProgressRef.current) void startGaze();
  }, [startGaze]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      startInProgressRef.current = false;
      releaseResources();
    };
  }, [releaseResources]);

  useEffect(() => {
    if (autoStart) void startGaze();
  }, [autoStart, startGaze]);

  const value = useMemo<GazeContextValue>(
    () => ({ stream, gaze, blinkCount, status, startGaze, stopGaze, startCalibration }),
    [stream, gaze, blinkCount, status, startGaze, stopGaze, startCalibration],
  );

  return (
    <GazeContext.Provider value={value}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none", left: -2, top: -2 }}
      />
      {children}
      {status === "error" && errorMessage && (
        <p role="alert" className="fixed bottom-3 left-3 right-3 z-[1000] mx-auto max-w-xl rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-lg">
          Gaze tracking error: {errorMessage}
        </p>
      )}
    </GazeContext.Provider>
  );
}
