import { useIrisStore } from "@/store/useIrisStore";
import { webLlmService } from "@/utils/webLlmService";

type PendingSpeak = {
  text: string;
  resolve: () => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
  fallbackStarted: boolean;
  done: boolean;
};

class TTSService {
  private worker: Worker | null = null;
  private audioCtx: AudioContext | null = null;
  public ready: boolean = false;
  public localAudioStream: MediaStream | null = null;
  private mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;
  private workerFailed: boolean = false;

  constructor() {
    // Client-side only
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  private init() {
    this.preloadVoices();

    try {
      this.worker = new Worker(new URL('../workers/tts.worker.ts', import.meta.url), { type: 'module' });

      this.worker.onmessage = (e) => {
        if (e.data.type === 'ready') {
          this.ready = true;
          console.log('[TTSService] ONNX model loaded and worker ready.');
        } else if (e.data.type === 'audio') {
          if (this.workerFailed) return;
          const pending = this.pendingSpeaks.shift();
          if (pending) clearTimeout(pending.timeout);
          if (!e.data.audio || e.data.audio.length === 0) {
            if (pending) this.fallbackPendingSpeak(pending, new Error('Worker returned empty audio'));
            return;
          }
          this.playAudioBuffer(e.data.audio, pending);
        } else if (e.data.type === 'error') {
          this.failWorker(e.data.error);
        }
      };

      this.worker.onerror = (e) => {
        this.failWorker(e.message || 'TTS worker failed');
      };

      this.worker.postMessage({ type: 'init' });
    } catch (error) {
      this.failWorker(error);
      this.worker = null;
    }
  }

  private preloadVoices() {
    const synthesis = window.speechSynthesis;
    if (!synthesis) return;
    synthesis.getVoices();
    synthesis.addEventListener('voiceschanged', () => synthesis.getVoices());
  }

  private ensureAudioContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    if (!this.mediaStreamDestination && this.audioCtx) {
      this.mediaStreamDestination = this.audioCtx.createMediaStreamDestination();
      this.localAudioStream = this.mediaStreamDestination.stream;
    }
  }

  private pendingSpeaks: PendingSpeak[] = [];
  private silenceTimeout: NodeJS.Timeout | null = null;
  private activeSpeaks: number = 0;

  public speak(text: string): Promise<void> {
    if (!text) return Promise.resolve();

    this.startSpeaking();
    if (!this.ready || !this.worker || this.workerFailed) {
      console.warn('[TTSService] Worker unavailable or not ready; using speech synthesis fallback.');
      return this.speakWithSynthesis(text).then(
        () => this.finishSpeaking(),
        (error) => {
          this.finishSpeaking();
          throw error;
        },
      );
    }

    return new Promise<void>((resolve, reject) => {
      let pending: PendingSpeak;
      pending = {
        text,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.failWorker(new Error('TTS worker did not return audio within 3 seconds'));
        }, 3000),
        fallbackStarted: false,
        done: false,
      };
      this.pendingSpeaks.push(pending);

      try {
        this.ensureAudioContext();
        if (!this.audioCtx) throw new Error('Web Audio is unavailable');
        if (this.silenceTimeout) {
          clearTimeout(this.silenceTimeout);
          this.silenceTimeout = null;
        }
        console.log(`[TTSService] Synthesizing: "${text}"`);
        this.worker!.postMessage({ type: 'speak', text });
      } catch (error) {
        this.failWorker(error);
      }
    });
  }

  private speakWithSynthesis(text: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
          throw new Error('Speech synthesis is unavailable');
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => resolve();
        utterance.onerror = (event) => reject(new Error(event.error || 'Speech synthesis failed'));
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        reject(error);
      }
    });
  }

  private failWorker(reason: unknown) {
    this.workerFailed = true;
    console.error('[TTSService] Worker/Web Audio failed; using speech synthesis fallback:', reason);
    for (const pending of [...this.pendingSpeaks]) {
      this.fallbackPendingSpeak(pending, reason);
    }
  }

  private fallbackPendingSpeak(pending: PendingSpeak, reason?: unknown) {
    if (pending.done || pending.fallbackStarted) return;
    pending.fallbackStarted = true;
    clearTimeout(pending.timeout);
    const index = this.pendingSpeaks.indexOf(pending);
    if (index !== -1) this.pendingSpeaks.splice(index, 1);
    if (reason) console.warn('[TTSService] Falling back for this utterance:', reason);

    this.speakWithSynthesis(pending.text).then(
      () => {
        pending.done = true;
        pending.resolve();
        this.finishSpeaking();
      },
      (error) => {
        pending.done = true;
        pending.reject(error);
        this.finishSpeaking();
      },
    );
  }

  private playAudioBuffer(float32Array: Float32Array, pending?: PendingSpeak) {
    try {
      this.ensureAudioContext();
      if (!this.audioCtx) throw new Error('Web Audio is unavailable');

      const buffer = this.audioCtx.createBuffer(1, float32Array.length, 44100);
      buffer.copyToChannel(float32Array as any, 0);

      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioCtx.destination);
      if (this.mediaStreamDestination) {
        source.connect(this.mediaStreamDestination);
      }
      source.onended = () => {
        if (pending) this.completePendingSpeak(pending);
      };
      source.start();
    } catch (error) {
      if (pending) this.fallbackPendingSpeak(pending, error);
      else console.error('[TTSService] Unable to play worker audio:', error);
    }
  }

  private completePendingSpeak(pending: PendingSpeak) {
    if (pending.done || pending.fallbackStarted) return;
    pending.done = true;
    clearTimeout(pending.timeout);
    pending.resolve();
    this.finishSpeaking();
  }

  private startSpeaking() {
    this.activeSpeaks += 1;
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    useIrisStore.getState().setIsAppSpeaking(true);
  }

  private finishSpeaking() {
    this.activeSpeaks = Math.max(0, this.activeSpeaks - 1);
    if (this.activeSpeaks === 0) {
      if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
      this.silenceTimeout = setTimeout(() => {
        if (this.activeSpeaks === 0) {
          useIrisStore.getState().setIsAppSpeaking(false);
        }
      }, 600); // 600ms grace period for room echo
    }
  }
}

export const ttsService = new TTSService();
