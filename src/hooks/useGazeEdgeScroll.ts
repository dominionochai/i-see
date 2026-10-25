import { useEffect, type RefObject } from "react";
import { useGaze } from "@/lib/gazeContext";

/** Gaze this close to the top or bottom edge of the list scrolls it. */
const EDGE_PX = 96;
const MAX_SPEED_PX = 14;

/** Scrolls `ref` while the gaze rests near its top or bottom edge; speed grows toward the edge. */
export function useGazeEdgeScroll(ref: RefObject<HTMLElement | null>, enabled = true) {
  const { gazePositionRef } = useGaze();

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const element = ref.current;
      if (!element) return;
      const { x, y } = gazePositionRef.current;
      const rect = element.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;

      const intoTop = EDGE_PX - (y - rect.top);
      const intoBottom = EDGE_PX - (rect.bottom - y);
      if (intoTop > 0) element.scrollTop -= Math.min(1, intoTop / EDGE_PX) * MAX_SPEED_PX;
      else if (intoBottom > 0) element.scrollTop += Math.min(1, intoBottom / EDGE_PX) * MAX_SPEED_PX;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, gazePositionRef, ref]);
}
