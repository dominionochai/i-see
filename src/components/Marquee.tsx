"use client";

import { motion } from "framer-motion";

interface MarqueeProps {
  text: string;
  speed?: number; // seconds for one full loop
  direction?: "left" | "right";
  className?: string;
  textClassName?: string;
}

export function Marquee({ 
  text, 
  speed = 20, 
  direction = "left",
  className = "",
  textClassName = "" 
}: MarqueeProps) {
  // Repeat the text enough times to fill the screen seamlessly
  const repeatedText = `${text}\u00A0\u00A0\u00A0`.repeat(10);

  return (
    <div className={`overflow-hidden whitespace-nowrap flex items-center ${className}`}>
      <motion.div
        className="flex"
        animate={{
          x: direction === "left" ? ["0%", "-50%"] : ["-50%", "0%"]
        }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration: speed,
        }}
      >
        <span className={`inline-block ${textClassName}`}>
          {repeatedText}
        </span>
        {/* Duplicate the span for seamless looping since we translate to -50% */}
        <span className={`inline-block ${textClassName}`}>
          {repeatedText}
        </span>
      </motion.div>
    </div>
  );
}
