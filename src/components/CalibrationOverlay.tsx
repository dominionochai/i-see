'use client';

import { useEffect, useRef, useState } from 'react';
import { useGaze } from '@/lib/gazeContext';
import { CALIBRATION_TARGETS } from '@/lib/calibration';
import { useIrisStore } from '@/store/useIrisStore';
import { GazeButton } from './GazeButton';

const DWELL_BEFORE_READY_MS = 1200; // settle time before the target becomes "ready to blink"

export function CalibrationOverlay() {
  const {
    isCalibrating,
    calibrationStep,
    blinkCount,
    recordCalibrationPoint,
    startCalibration,
    resetCalibration,
    isCalibrated,
    isTracking,
  } = useGaze();

  const appStage = useIrisStore(state => state.appStage);
  const setAppStage = useIrisStore(state => state.setAppStage);

  const prevBlinkRef = useRef(blinkCount);
  const [ready, setReady]   = useState(false);   // target has settled — blink to confirm
  const [pulse, setPulse]   = useState(false);    // brief pulse on confirm
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Reset "ready" state when the step changes
  useEffect(() => {
    setTimeout(() => setReady(false), 0);
    clearTimeout(timerRef.current);
    if (isCalibrating) {
      timerRef.current = setTimeout(() => setReady(true), DWELL_BEFORE_READY_MS);
    }
  }, [calibrationStep, isCalibrating]);

  // Listen for blinks — only during calibration and when target is ready
  useEffect(() => {
    if (!isCalibrating || !ready) {
      prevBlinkRef.current = blinkCount;
      return;
    }
    if (blinkCount !== prevBlinkRef.current) {
      prevBlinkRef.current = blinkCount;
      setPulse(true);
      setTimeout(() => {
        setPulse(false);
        recordCalibrationPoint();
      }, 250);
    }
  }, [blinkCount, isCalibrating, ready, recordCalibrationPoint]);

  // Auto-start calibration if we enter the calibrating stage and camera is ready
  useEffect(() => {
    if (appStage === 'calibrating' && !isCalibrating && !isCalibrated && isTracking) {
      startCalibration();
    }
  }, [appStage, isCalibrating, isCalibrated, isTracking, startCalibration]);

  // Move to project stage when calibration finishes
  useEffect(() => {
    if (appStage === 'calibrating' && isCalibrated) {
      setAppStage('project');
    }
  }, [appStage, isCalibrated, setAppStage]);

  if (appStage === 'landing') return null;

  if (!isCalibrating) {
    return (
      <div style={{
        position: 'fixed', bottom: 24, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 800,
        display: 'flex', gap: 16,
      }}>
        <GazeButton
          id="recalibrate-btn"
          customDwellTime={600}
          className="px-6 py-3 text-lg !bg-white !border-[2px] !border-[var(--ink)] shadow-[0_6px_0_var(--ink)] rounded-2xl font-bold transition-transform hover:-translate-y-1 active:translate-y-1 active:shadow-[0_0px_0_var(--ink)]"
          accentColor="#4A1D6B"
          textColor="black"
          text={isCalibrated ? '↺ Recalibrate' : '◎ Calibrate'}
          onClick={startCalibration}
        />
        {isCalibrated && (
          <GazeButton
            id="reset-calib-btn"
            customDwellTime={600}
            className="px-6 py-3 text-lg !bg-white !border-[2px] !border-[var(--ink)] shadow-[0_6px_0_var(--ink)] rounded-2xl font-bold transition-transform hover:-translate-y-1 active:translate-y-1 active:shadow-[0_0px_0_var(--ink)]"
            accentColor="#E63946"
            textColor="black"
            text="✕ Reset"
            onClick={resetCalibration}
          />
        )}
      </div>
    );
  }

  const target    = CALIBRATION_TARGETS[calibrationStep];
  const total     = CALIBRATION_TARGETS.length;
  const targetX   = target.x * window.innerWidth;
  const targetY   = target.y * window.innerHeight;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--iris-bg)',
      zIndex: 900,
      cursor: 'none',
    }}>
      {/* Instructions */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <p style={{ color: 'var(--iris-text-muted)', fontSize: 13, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', fontWeight: 'bold' }}>
          CALIBRATION · POINT {calibrationStep + 1} / {total}
        </p>
        <p style={{ color: 'var(--iris-text)', fontSize: 18, marginTop: 8, fontWeight: 'bold' }}>
          {ready ? 'Blink to confirm' : 'Look at the target…'}
        </p>
      </div>

      {/* Progress dots */}
      <div style={{
        position: 'absolute', bottom: 36, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', gap: 10,
      }}>
        {CALIBRATION_TARGETS.map((_, i) => (
          <div
            key={i}
            style={{
              width: 10, height: 10, borderRadius: '50%',
              background: i < calibrationStep
                ? 'var(--ink)' // Solid black for completed
                : i === calibrationStep
                ? '#4A1D6B' // Coffee brown for current
                : 'rgba(0,0,0,0.15)', // Dark transparent for upcoming
              border: i === calibrationStep ? '2px solid #000' : 'none',
              transition: 'all 0.3s',
            }}
          />
        ))}
      </div>

      {/* Target */}
      <div
        style={{
          position: 'absolute',
          left: targetX,
          top: targetY,
          transform: 'translate(-50%, -50%)',
          transition: 'left 0.5s cubic-bezier(.4,0,.2,1), top 0.5s cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* Outer pulsing ring */}
        <div style={{
          position: 'absolute',
          inset: -20,
          borderRadius: '50%',
          border: `3px solid ${ready ? '#000' : 'rgba(0,0,0,0.2)'}`,
          opacity: ready ? 0.8 : 0.4,
          animation: ready ? 'calPulse 1.2s ease-in-out infinite' : 'none',
        }} />
        {/* Main circle */}
        <div style={{
          width: 32, height: 32,
          borderRadius: '50%',
          border: `3px solid ${pulse ? '#1FB57A' : ready ? '#000' : 'rgba(0,0,0,0.3)'}`,
          background: pulse
            ? '#1FB57A'
            : ready
            ? '#000'
            : 'rgba(0,0,0,0.05)',
          transition: 'border-color 0.2s, background 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 16px rgba(0,0,0,0.3)'
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: pulse ? '#fff' : ready ? '#fff' : 'rgba(0,0,0,0.4)',
          }} />
        </div>
      </div>
    </div>
  );
}

function ctrlStyle(color: string): React.CSSProperties {
  return {
    background: 'var(--iris-surface)',
    border: `1px solid var(--iris-border)`,
    color,
    padding: '8px 18px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.06em',
    cursor: 'none',
    outline: 'none',
    boxShadow: 'var(--shadow-sm)'
  };
}
