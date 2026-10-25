import { useEffect, useRef } from "react";
import { useIrisStore } from "@/store/useIrisStore";
import { webLlmService } from "@/utils/webLlmService";

export function useWhisperMic(stream: MediaStream | null) {
  const workerRef = useRef<Worker | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const chunksRef = useRef<Float32Array[]>([]);
  const isSpeakingRef = useRef<boolean>(false);
  const silenceStartRef = useRef<number>(0);
  const totalSamplesRef = useRef<number>(0);
  const downloadStats = useRef<Record<string, { loaded: number; total: number }>>({});

  // Initialize the Web Worker
  useEffect(() => {
    const worker = new Worker('/stt.worker.js', { type: 'module' });
    
    worker.onerror = (err) => {
      console.error('[useWhisperMic] Worker onerror:', err);
      useIrisStore.getState().setSttError("Worker initialization failed: " + (err.message || 'Unknown error'));
      useIrisStore.getState().setIsTranscribing(false);
    };

    worker.onmessage = (e) => {
      if (e.data.type === 'ready') {
        useIrisStore.getState().setSttReady(true);
        useIrisStore.getState().setSttError(null);
      } else if (e.data.type === 'progress') {
        const info = e.data.data;
        if (info.status === 'progress' && info.file) {
          downloadStats.current[info.file] = { loaded: info.loaded, total: info.total };
          
          let totalLoaded = 0;
          let totalSize = 0;
          for (const stats of Object.values(downloadStats.current)) {
            totalLoaded += stats.loaded;
            totalSize += stats.total;
          }
          
          if (totalSize > 0) {
            const progress = Math.min(100, Math.max(0, Math.round((totalLoaded / totalSize) * 100)));
            useIrisStore.getState().setSttDownloadProgress(progress);
          }
        }
      } else if (e.data.type === 'result') {
        let transcript = (e.data.text || "").trim();
        useIrisStore.getState().setIsTranscribing(false);
        
        // Filter out whisper hallucinated blank audio tags and noise brackets
        if (
          transcript.toUpperCase() === "[BLANK_AUDIO]" || 
          transcript.includes("[SILENCE]") ||
          transcript.includes("[") ||
          transcript.includes("]") ||
          transcript.includes("(") ||
          transcript.includes(")")
        ) {
          transcript = "";
        }

        if (transcript && useIrisStore.getState().appStage === "project") {
          useIrisStore.getState().setLiveCaption(transcript);
          useIrisStore.getState().setAmbientContext(transcript);
          webLlmService.predictFromAmbientContext(transcript);
        }
      } else if (e.data.type === 'error') {
        console.error('[useWhisperMic] STT Worker error:', e.data.error);
        useIrisStore.getState().setIsTranscribing(false);
        useIrisStore.getState().setSttError(String(e.data.error));
      }
    };
    worker.postMessage({ type: 'init' });
    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, []);

  // Set up the VAD Loop
  useEffect(() => {
    if (!stream) return;

    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextCtor({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;
      
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      // Reset tracking vars
      chunksRef.current = [];
      totalSamplesRef.current = 0;
      isSpeakingRef.current = false;
      silenceStartRef.current = 0;
      
      const startTime = performance.now();

      processor.onaudioprocess = (e) => {
        // Guardrail 1: Warm-Up Skip (200ms)
        if (performance.now() - startTime < 200) return;

        // Guardrail 2: Do not listen to ourselves (or room echo)
        if (useIrisStore.getState().isAppSpeaking) {
          if (chunksRef.current.length > 0) {
            chunksRef.current = [];
            totalSamplesRef.current = 0;
            isSpeakingRef.current = false;
            silenceStartRef.current = 0;
          }
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate RMS
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSquares / inputData.length);

        if (rms > 0.01) {
          isSpeakingRef.current = true;
          silenceStartRef.current = 0;
        }

        if (isSpeakingRef.current) {
          const chunk = new Float32Array(inputData);
          chunksRef.current.push(chunk);
          totalSamplesRef.current += chunk.length;

          if (rms <= 0.01) {
            if (silenceStartRef.current === 0) {
              silenceStartRef.current = performance.now();
            } else if (performance.now() - silenceStartRef.current > 1000) {
              // Flush due to silence egress
              flushBuffer();
            }
          }
          
          // Guardrail 2: Max-Duration Flush (160,000 samples)
          if (totalSamplesRef.current >= 160000) {
            flushBuffer();
          }
        }
      };

      const flushBuffer = () => {
        if (chunksRef.current.length === 0 || !workerRef.current) return;
        
        const totalLength = totalSamplesRef.current;
        const mergedArray = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of chunksRef.current) {
          mergedArray.set(chunk, offset);
          offset += chunk.length;
        }
        
        useIrisStore.getState().setIsTranscribing(true);
        // Transfer ownership
        workerRef.current.postMessage({ type: 'transcribe', audio: mergedArray }, [mergedArray.buffer]);
        
        // Reset states
        chunksRef.current = [];
        totalSamplesRef.current = 0;
        isSpeakingRef.current = false;
        silenceStartRef.current = 0;
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      
    } catch (err) {
      console.error("Error setting up VAD Loop", err);
    }

    return () => {
      if (processorRef.current) processorRef.current.disconnect();
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [stream]);
}
