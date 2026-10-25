'use client';

import { motion } from 'framer-motion';
import { Playfair_Display } from 'next/font/google';
import { useIrisStore } from '@/store/useIrisStore';
import { useContext } from 'react';
import { GazeContext } from '@/lib/gazeContext';
import { webLlmService } from '@/utils/webLlmService';
import { DwellDemo } from './DwellDemo';
import { Marquee } from './Marquee';

const playfair = Playfair_Display({ subsets: ['latin'] });

export function LandingPage() {
  const setAppStage = useIrisStore(state => state.setAppStage);
  const { initialize } = useContext(GazeContext);

  const handleStart = () => {
    // 1. Trigger camera/model load
    initialize();
    // 2. Trigger local WebLLM model download in the background during calibration
    webLlmService.init();
    // 3. Go to calibrating state
    setAppStage('calibrating');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[1000] bg-[var(--iris-bg)] text-slate-900 flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Dynamic Grid Background */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, slate-900 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }}
      />

      {/* Top Marquee */}
      <div className="absolute top-0 left-0 w-full border-b-4 border-slate-900 bg-white py-2 z-10 shadow-[0_4px_0_0_rgba(42,14,58,1)]">
        <Marquee 
          text="ZERO HARDWARE REQUIRED • EYE-TRACKING COMMUNICATION OS • MEDICAL GRADE • BROWSER NATIVE •" 
          textClassName="text-slate-900 font-bold tracking-widest text-sm uppercase"
          speed={30}
        />
      </div>

      {/* Main Content */}
      <div className="z-10 max-w-4xl w-full px-6 flex flex-col items-center text-center space-y-10 mt-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center"
        >
          {/* Live mini-demo: hold a tile to make it speak */}
          <div className="mb-4 w-full pt-8">
            <DwellDemo />
          </div>

          <div className="relative inline-block mb-4">
            <div className="absolute top-2 left-2 w-full h-full bg-[var(--cat-physical)] rounded-lg border-4 border-slate-900" />
            <div className="relative bg-white border-4 border-slate-900 px-10 py-4 rounded-lg flex items-center justify-center">
              <h1 className={`${playfair.className} text-7xl md:text-9xl tracking-tight font-black text-slate-900 uppercase`}>
                i-see
              </h1>
            </div>
          </div>
          
          <h2 className="text-2xl md:text-3xl font-bold mb-6 tracking-wide text-center bg-white border-4 border-slate-900 px-6 py-2 shadow-[4px_4px_0_0_rgba(42,14,58,1)] mt-4">
            Advanced eye-tracking.
          </h2>
          
          <p className="text-lg md:text-xl font-bold max-w-2xl leading-relaxed text-center bg-[#FFC93C] border-4 border-slate-900 px-6 py-4 shadow-[4px_4px_0_0_rgba(42,14,58,1)]">
            A communication OS that listens to the room, predicts your needs, and tracks your gaze with mathematical perfection. <br/><span className="bg-white px-2 py-0.5 text-[var(--ink)] box-decoration-clone">Giving paralyzed patients their autonomy back, one blink at a time.</span>
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.5, type: 'spring', bounce: 0.5 }}
        >
          <motion.button
            onClick={handleStart}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95, x: 4, y: 4, boxShadow: '0px 0px 0px 0px rgba(42,14,58,1)' }}
            className="group relative px-12 py-6 bg-[#00897B] text-white rounded-xl border-4 border-slate-900 text-2xl font-black tracking-widest uppercase transition-all duration-150 ease-out shadow-[8px_8px_0_0_rgba(42,14,58,1)]"
          >
            Start Experience
          </motion.button>
        </motion.div>
      </div>

      {/* Bottom Marquee */}
      <div className="absolute bottom-0 left-0 w-full border-t-4 border-slate-900 bg-white py-2 z-10 shadow-[0_-4px_0_0_rgba(42,14,58,1)]">
        <Marquee 
          text="SECURE • PRIVATE • ON-DEVICE PROCESSING • LOCAL AI ENGINE •" 
          textClassName="text-slate-900 font-bold tracking-widest text-sm uppercase"
          speed={25}
          direction="right"
        />
      </div>
    </motion.div>
  );
}
