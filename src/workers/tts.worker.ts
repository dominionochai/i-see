import * as ort from 'onnxruntime-web';
import { textToPhonemeIds, loadTokenizerModels } from '../utils/ttsTokenizer';

// Use jsdelivr to load the WebAssembly binaries instead of local paths to avoid Next.js webpack issues.
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

let session: ort.InferenceSession | null = null;
let initialized = false;

self.onmessage = async (e: MessageEvent) => {
  const { type, text } = e.data;
  
  if (type === 'init') {
    try {
      await loadTokenizerModels();
      session = await ort.InferenceSession.create('/models/tinytts.onnx', {
        executionProviders: ['wasm']
      });
      initialized = true;
      self.postMessage({ type: 'ready' });
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.toString() });
    }
  } else if (type === 'speak') {
    if (!initialized || !session) {
      self.postMessage({ type: 'error', error: 'Worker not initialized' });
      return;
    }
    try {
      const { phoneIds, toneIds, langIds } = textToPhonemeIds(text);
      const seqLen = phoneIds.length;
      
      const feeds: Record<string, ort.Tensor> = {
        x: new ort.Tensor('int64', BigInt64Array.from(phoneIds.map(v => BigInt(v))), [1, seqLen]),
        x_lengths: new ort.Tensor('int64', [BigInt(seqLen)], [1]),
        sid: new ort.Tensor('int64', [BigInt(0)], [1]),
        tone: new ort.Tensor('int64', BigInt64Array.from(toneIds.map(v => BigInt(v))), [1, seqLen]),
        language: new ort.Tensor('int64', BigInt64Array.from(langIds.map(v => BigInt(v))), [1, seqLen]),
        bert: new ort.Tensor('float32', new Float32Array(seqLen * 1024), [1, 1024, seqLen]),
        ja_bert: new ort.Tensor('float32', new Float32Array(seqLen * 768), [1, 768, seqLen]),
        noise_scale: new ort.Tensor('float32', [0.667], [1]),
        noise_scale_w: new ort.Tensor('float32', [0.8], [1]),
        length_scale: new ort.Tensor('float32', [1.0], [1]),
      };

      const results = await session.run(feeds);
      const audio = results.audio.data as Float32Array;
      
      // We pass the underlying ArrayBuffer using Transferable objects for performance
      self.postMessage({ type: 'audio', audio: audio }, { transfer: [audio.buffer] });
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.toString() });
    }
  }
};
