export function playLocalLaugh(): void {
  if (typeof window === "undefined") return;

  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextConstructor) return;

  let context: AudioContext;
  try {
    context = new AudioContextConstructor();
  } catch {
    return;
  }

  const start = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.linearRampToValueAtTime(0.24, start + 0.025);
  master.gain.setValueAtTime(0.24, start + 0.48);
  master.gain.exponentialRampToValueAtTime(0.0001, start + 0.78);
  master.connect(context.destination);

  // A short series of voiced, pitch-bending syllables gives the laugh its
  // character without loading or requesting any media from a remote URL.
  const syllables = [
    { at: 0.04, duration: 0.14, pitch: 228 },
    { at: 0.23, duration: 0.13, pitch: 278 },
    { at: 0.41, duration: 0.16, pitch: 244 },
  ];

  for (const { at, duration, pitch } of syllables) {
    const oscillator = context.createOscillator();
    const syllableGain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(pitch, start + at);
    oscillator.frequency.exponentialRampToValueAtTime(
      pitch * 0.72,
      start + at + duration,
    );
    syllableGain.gain.setValueAtTime(0.0001, start + at);
    syllableGain.gain.linearRampToValueAtTime(0.62, start + at + 0.025);
    syllableGain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + at + duration,
    );
    oscillator.connect(syllableGain);
    syllableGain.connect(master);
    oscillator.start(start + at);
    oscillator.stop(start + at + duration + 0.01);
  }

  // Add a quiet burst of locally generated breath/noise under the syllables.
  const bufferSize = Math.ceil(context.sampleRate * 0.62);
  const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    noiseData[i] = Math.random() * 2 - 1;
  }
  const noise = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = noiseBuffer;
  filter.type = "bandpass";
  filter.frequency.value = 1050;
  filter.Q.value = 0.7;
  noiseGain.gain.setValueAtTime(0.0001, start);
  noiseGain.gain.linearRampToValueAtTime(0.055, start + 0.04);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.62);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(start);
  noise.stop(start + 0.63);

  const close = () => {
    void context.close().catch(() => undefined);
  };
  noise.addEventListener("ended", close, { once: true });
  void context.resume().catch(() => undefined);
}
