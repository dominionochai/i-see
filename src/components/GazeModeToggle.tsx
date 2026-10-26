'use client';

import { useEffect, useRef, useState } from 'react';
import { useGaze } from '@/lib/gazeContext';

export default function GazeModeToggle() {
  const { gazePositionRef } = useGaze();
  const [gazeMode, setGazeMode] = useState(false);
  const [dotPos, setDotPos] = useState({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.style.cursor = gazeMode ? 'none' : '';
    if (!gazeMode) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      return () => { document.documentElement.style.cursor = ''; };
    }
    const loop = () => {
      const p = gazePositionRef?.current;
      if (p) setDotPos({ x: p.x, y: p.y });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      document.documentElement.style.cursor = '';
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [gazeMode, gazePositionRef]);

  return (
    <>
      {gazeMode && (
        <div
          style={{
            position: 'fixed',
            left: dotPos.x,
            top: dotPos.y,
            transform: 'translate(-50%, -50%)',
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: '#7c3aed',
            boxShadow: '0 0 12px rgba(124, 58, 237, 0.8)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        />
      )}
      <button
        onClick={() => setGazeMode((m) => !m)}
        style={{
          position: 'fixed',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          padding: '4px 14px',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(0,0,0,0.7)',
          color: '#fff',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {gazeMode ? 'CURSOR' : 'GAZE'}
      </button>
    </>
  );
}
