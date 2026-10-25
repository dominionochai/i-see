self.postMessage({ type: 'log', msg: 'WORKER: Script evaluated.' });

let transcriberPromise: any = null;

async function getTranscriber() {
  self.postMessage({ type: 'log', msg: 'WORKER: getTranscriber() called.' });
  
  if (!transcriberPromise) {
    self.postMessage({ type: 'log', msg: 'WORKER: Dynamically importing transformers...' });
    
    transcriberPromise = (async () => {
      try {
        const { pipeline, env } = await import('@xenova/transformers');
        self.postMessage({ type: 'log', msg: 'WORKER: transformers imported successfully.' });
        
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        if (env.backends?.onnx?.wasm) {
          env.backends.onnx.wasm.numThreads = 1;
        }

        self.postMessage({ type: 'log', msg: 'WORKER: Calling pipeline()...' });
        
        const pipe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
          quantized: true,
          progress_callback: (info: any) => {
            self.postMessage({ type: 'log', msg: 'WORKER progress: ' + info.status });
            self.postMessage({ type: 'progress', data: info });
          }
        });
        
        self.postMessage({ type: 'log', msg: 'WORKER: Pipeline resolved successfully.' });
        return pipe;
      } catch (err: any) {
        self.postMessage({ type: 'log', msg: 'WORKER: Pipeline rejected: ' + String(err) });
        throw err;
      }
    })();
  }
  return transcriberPromise;
}

self.onmessage = async (e: MessageEvent) => {
  self.postMessage({ type: 'log', msg: 'WORKER: Received message: ' + e.data.type });
  const { type, audio } = e.data;
  
  if (type === 'init') {
    try {
      await getTranscriber();
      self.postMessage({ type: 'log', msg: 'WORKER: Init complete. Sending ready.' });
      self.postMessage({ type: 'ready' });
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.toString() });
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
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.toString() });
    }
  }
};
