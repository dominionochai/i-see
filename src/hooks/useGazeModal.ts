import { useEffect } from "react";

const MODAL_ATTRIBUTE = "data-gaze-modal";
let openModalCount = 0;

/**
 * Marks the page as having a full-screen panel open while `active` is true.
 * Gaze buttons outside an element carrying `data-gaze-modal-root` ignore gaze
 * and blinks meanwhile, so a blink aimed at the panel can't trigger a tile
 * hidden underneath it. Safe with several panels open at once.
 */
export function useGazeModal(active: boolean) {
  useEffect(() => {
    if (!active) return;
    openModalCount += 1;
    document.body.setAttribute(MODAL_ATTRIBUTE, "");
    return () => {
      openModalCount -= 1;
      if (openModalCount <= 0) {
        openModalCount = 0;
        document.body.removeAttribute(MODAL_ATTRIBUTE);
      }
    };
  }, [active]);
}
