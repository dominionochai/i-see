'use client';

import { useGaze } from '@/lib/gazeContext';

const STATUS_LABELS: Record<string, string> = {
  idle:              'STANDBY',
  'loading-model':   'LOADING MODEL',
  'requesting-camera': 'CAMERA',
  ready:             'TRACKING',
  error:             'ERROR',
};

export function StatusBar() {
  const {
    initStatus, isWebGPU, isFaceDetected,
    isCalibrated, isTracking, errorMessage,
    blinkCount,
  } = useGaze();

  const label  = STATUS_LABELS[initStatus] ?? 'UNKNOWN';
  const isReady = initStatus === 'ready';
  const isErr   = initStatus === 'error';

  return (
    <div className="flex items-center gap-2">
      <Chip label={label} active={isReady} error={isErr} dot />
      <Chip label="FACE" active={isFaceDetected} dim={!isFaceDetected} dot />
      <Chip label={isCalibrated ? 'CALIBRATED' : 'UNCALIB.'} active={isCalibrated} dim={!isCalibrated} />
      {isTracking && <Chip label={`BLINK ×${blinkCount}`} dim />}
      {isErr && (
        <span className="text-[10px] text-[var(--iris-danger)] max-w-[200px] truncate ml-2 tracking-wide">
          {errorMessage}
        </span>
      )}
    </div>
  );
}

function Chip({ label, active, error, dim, dot }: { label: string; active?: boolean; error?: boolean; dim?: boolean; dot?: boolean; }) {
  const color = error ? 'var(--iris-danger)' : active ? 'var(--iris-accent)' : dim ? 'var(--iris-text-muted)' : 'var(--iris-text-secondary)';
  
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${active ? 'border-[var(--iris-accent)]/20 bg-[var(--iris-accent)]/5' : 'border-transparent'}`}>
      {dot && (
        <div 
          className="w-1.5 h-1.5 rounded-full" 
          style={{ backgroundColor: color, boxShadow: active ? `0 0 5px ${color}` : 'none' }} 
        />
      )}
      <span className="text-[9px] tracking-[0.1em] font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}
