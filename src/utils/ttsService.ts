import { useIrisStore } from "@/store/useIrisStore";
import { webLlmService } from "@/utils/webLlmService";

class TTSService {
  private worker: Worker | null = null;
  private audioCtx: AudioContext | null = null;
  public ready: boolean = false;
  public localAudioStream: MediaStream | null = null;
  private mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;
  
  constructor() {
    // Client-side only
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  private init() {
    this.worker = new Worker(new URL('../workers/tts.worker.ts', import.meta.url), { type: 'module' });
    
    this.worker.onmessage = (e) => {
      if (e.data.type === 'ready') {
        this.ready = true;
        console.log('[TTSService] ONNX model loaded and worker ready.');
      } else if (e.data.type === 'audio') {
        this.playAudioBuffer(e.data.audio);
      } else if (e.data.type === 'error') {
        console.error('[TTSService] Worker error:', e.data.error);
      }
    };
    
    this.worker.postMessage({ type: 'init' });
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

  private speakPromises: Array<(value: void | PromiseLike<void>) => void> = [];
  private silenceTimeout: NodeJS.Timeout | null = null;

  public speak(text: string): Promise<void> {
    if (!text) return Promise.resolve();

    return new Promise((resolve) => {
      if (!this.ready || !this.worker) {
        console.warn('[TTSService] Not ready yet.');
        resolve();
        return;
      }
      this.ensureAudioContext();
      if (this.silenceTimeout) {
        clearTimeout(this.silenceTimeout);
        this.silenceTimeout = null;
      }
      useIrisStore.getState().setIsAppSpeaking(true);
      console.log(`[TTSService] Synthesizing: "${text}"`);
      
      this.speakPromises.push(resolve);
      this.worker.postMessage({ type: 'speak', text });
    });
  }

  private playAudioBuffer(float32Array: Float32Array) {
    this.ensureAudioContext();
    if (!this.audioCtx) {
      this.resolveNextPromise();
      return;
    }

    const buffer = this.audioCtx.createBuffer(1, float32Array.length, 44100);
    buffer.copyToChannel(float32Array as any, 0);
    
    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioCtx.destination);
    if (this.mediaStreamDestination) {
      source.connect(this.mediaStreamDestination);
    }
    source.onended = () => {
      this.resolveNextPromise();
    };
    source.start();
  }

  private resolveNextPromise() {
    const resolve = this.speakPromises.shift();
    if (resolve) resolve();
    if (this.speakPromises.length === 0) {
      if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
      this.silenceTimeout = setTimeout(() => {
        if (this.speakPromises.length === 0) {
          useIrisStore.getState().setIsAppSpeaking(false);
        }
      }, 600); // 600ms grace period for room echo
    }
  }
}

export const ttsService = new TTSService();

