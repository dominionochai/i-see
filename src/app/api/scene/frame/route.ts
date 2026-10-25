import { BadRequestError } from "@/lib/server/errors";
import { errorResponse, json } from "@/lib/server/http";
import { detectImageType, getSceneFrame, MAX_FRAME_BYTES, setSceneFrame } from "@/lib/server/sceneStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The scene relay carries camera frames from a phone to the laptop. It has no
 * authentication, so it only runs in development unless explicitly enabled.
 */
const isEnabled = () => process.env.NODE_ENV !== "production" || process.env.ENABLE_SCENE_RELAY === "1";

const disabled = () => json({ error: "The scene relay is disabled in production." }, 404);

/** Phone → server: stores the latest frame (raw JPEG or PNG bytes in the body). */
export async function POST(request: Request) {
  if (!isEnabled()) return disabled();
  try {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_FRAME_BYTES) throw new BadRequestError("Frame is too large.");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_FRAME_BYTES) throw new BadRequestError("Frame is empty or too large.");
    const mimeType = detectImageType(bytes);
    if (!mimeType) throw new BadRequestError("Frame must be a JPEG or PNG image.");
    const frame = setSceneFrame(bytes, mimeType);
    return json({ id: frame.id });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Laptop → server: returns the newest frame. Pass `?since=<id>` to get 204
 * when nothing newer exists, which keeps polling cheap.
 */
export async function GET(request: Request) {
  if (!isEnabled()) return disabled();
  const frame = getSceneFrame();
  if (!frame) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
  if (Number.isFinite(since) && since >= frame.id) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(frame.bytes as BodyInit, {
    headers: {
      "Content-Type": frame.mimeType,
      "Cache-Control": "no-store",
      "X-Frame-Id": String(frame.id),
      "X-Frame-Age-Ms": String(Date.now() - frame.receivedAt),
    },
  });
}
