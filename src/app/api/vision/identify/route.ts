import { parseVisionResult, VISION_LIMITS } from "@/lib/vision";
import { BadRequestError, UpstreamError } from "@/lib/server/errors";
import { geminiJson, type GeminiPart } from "@/lib/server/gemini";
import { errorResponse, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Base64 expands data by 4/3. */
const MAX_BASE64_CHARS = Math.ceil((VISION_LIMITS.imageBytes * 4) / 3);

const PROMPT = `You help a person who cannot speak communicate by looking at things around them.
Image 1 is a close crop of the exact thing they are looking at. Image 2, if present, is the wider scene for context.

Reply with ONLY a JSON object:
{
  "object": "<the main object in image 1, 1-3 words>",
  "confidence": "high" | "medium" | "low",
  "sentence": "<what they most likely want to say about it, first person, one short polite sentence>",
  "alternatives": ["<two or three other short things they might want to say about it>"]
}

Examples: a cup -> "Could I have some water, please?"; a pill bottle -> "Can I have my medication, please?"; a phone -> "Could you hand me my phone?"; a blanket -> "I'm cold. Could I have my blanket?"
If the crop shows nothing recognisable, use object "unclear" and confidence "low".`;

interface ImagePayload {
  data: string;
  mimeType: string;
}

function parseImage(value: unknown, name: string, required: boolean): ImagePayload | null {
  if (value === undefined || value === null) {
    if (required) throw new BadRequestError(`"${name}" is required.`);
    return null;
  }
  if (typeof value !== "object") throw new BadRequestError(`"${name}" must be an object.`);
  const { data, mimeType } = value as Record<string, unknown>;
  if (typeof data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new BadRequestError(`"${name}.data" must be base64 without a data: prefix.`);
  }
  if (data.length > MAX_BASE64_CHARS) throw new BadRequestError(`"${name}" is too large.`);
  if (typeof mimeType !== "string" || !ALLOWED_MIME.has(mimeType)) {
    throw new BadRequestError(`"${name}.mimeType" must be image/jpeg, image/png or image/webp.`);
  }
  return { data, mimeType };
}

/** Names what the person is looking at and suggests what they might want to say. */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request, MAX_BODY_BYTES)) as Record<string, unknown> | null;
    if (typeof body !== "object" || body === null) throw new BadRequestError("Body must be a JSON object.");
    const focus = parseImage(body.focus, "focus", true);
    const context = parseImage(body.context, "context", false);

    const parts: GeminiPart[] = [{ text: PROMPT }, { inlineData: { mimeType: focus!.mimeType, data: focus!.data } }];
    if (context) parts.push({ inlineData: { mimeType: context.mimeType, data: context.data } });

    const result = parseVisionResult(await geminiJson(parts));
    if (!result) throw new UpstreamError("The vision model gave an unusable answer.");
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
