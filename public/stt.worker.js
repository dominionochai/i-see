import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

self.postMessage({ type: 'log', msg: 'WORKER: Script evaluated from CDN.' });

env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

let transcriberPromise = null;

async function getTranscriber() {
  self.postMessage({ type: 'log', msg: 'WORKER: getTranscriber() called.' });
  if (!transcriberPromise) {
    self.postMessage({ type: 'log', msg: 'WORKER: Calling pipeline()...' });
    transcriberPromise = pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      quantized: true,
      progress_callback: (info) => {
        self.postMessage({ type: 'progress', data: info });
      }
    });
    
    transcriberPromise.then(() => {
      self.postMessage({ type: 'log', msg: 'WORKER: Pipeline resolved successfully.' });
    }).catch((err) => {
      self.postMessage({ type: 'log', msg: 'WORKER: Pipeline rejected: ' + String(err) });
    });
  }
  return transcriberPromise;
}

self.onmessage = async (e) => {
  self.postMessage({ type: 'log', msg: 'WORKER: Received message: ' + e.data.type });
  const { type, audio } = e.data;
  
  if (type === 'init') {
    try {
      await getTranscriber();
      self.postMessage({ type: 'log', msg: 'WORKER: Init complete. Sending ready.' });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) });
    }
  } else if (type === 'transcribe') {
    try {
      const transcriber = await getTranscriber();
      
      const result = await transcriber(audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      });
      
      self.postMessage({ type: 'result', text: result.text });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) });
    }
  }
};
