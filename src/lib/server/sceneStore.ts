/** Largest accepted scene frame. A 640 px JPEG is normally well under 200 KB. */
export const MAX_FRAME_BYTES = 1_500_000;

export interface SceneFrame {
  id: number;
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
  receivedAt: number;
}

interface SceneStore {
  frame: SceneFrame | null;
  nextId: number;
}

// Kept on globalThis so dev-server hot reloads don't drop the latest frame.
const globalStore = globalThis as typeof globalThis & { __irisSceneStore?: SceneStore };
const store: SceneStore = (globalStore.__irisSceneStore ??= { frame: null, nextId: 1 });

/** Identifies the image format from its magic bytes, or null if unsupported. */
export function detectImageType(bytes: Uint8Array): SceneFrame["mimeType"] | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

export function setSceneFrame(bytes: Uint8Array, mimeType: SceneFrame["mimeType"], now = Date.now()): SceneFrame {
  const frame: SceneFrame = { id: store.nextId++, bytes, mimeType, receivedAt: now };
  store.frame = frame;
  return frame;
}

export function getSceneFrame(): SceneFrame | null {
  return store.frame;
}

export function clearSceneFrame() {
  store.frame = null;
}
