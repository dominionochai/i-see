import { requireEnv } from "./env";
import { UpstreamError } from "./errors";
import { parseModelJson, postJson, type FetchLike } from "./jsonModels";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** Current multimodal Flash model. Override with GEMINI_MODEL. */
const DEFAULT_MODEL = "gemini-3.8-flash";

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/** Sends text and images to Gemini and returns its JSON answer parsed. */
export async function geminiJson(
  parts: GeminiPart[],
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const payload = await postJson(
    `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": requireEnv("GEMINI_API_KEY") },
    {
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    },
    fetchImpl,
  ) as GeminiResponse;

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!text) throw new UpstreamError("The model returned an empty response.");
  return parseModelJson(text);
}
