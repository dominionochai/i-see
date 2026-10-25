export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Share of the image's shorter side covered by the crop around the point of interest. */
export const FOCUS_FRACTION = 0.34;

/**
 * Maps a screen point to a position within an on-screen image, as fractions
 * (0-1) of its width and height. Returns null when the point is outside it.
 */
export function pointInRect(x: number, y: number, rect: ScreenRect): { u: number; v: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const u = (x - rect.left) / rect.width;
  const v = (y - rect.top) / rect.height;
  return u < 0 || u > 1 || v < 0 || v > 1 ? null : { u, v };
}

/**
 * A square crop (in image pixels' proportions) centred on (u, v), shifted to
 * stay inside the image so objects near an edge still get a full-size crop.
 * `aspect` is image width / height.
 */
export function focusBox(u: number, v: number, aspect: number, fraction = FOCUS_FRACTION): NormalizedBox {
  const width = aspect >= 1 ? fraction / aspect : fraction;
  const height = aspect >= 1 ? fraction : fraction * aspect;
  const clamp = (value: number, size: number) => Math.min(1 - size, Math.max(0, value - size / 2));
  return { x: clamp(u, width), y: clamp(v, height), width, height };
}
