import { requireEnv } from "./env";
import { UpstreamError } from "./errors";
import { parseModelJson, postJson, type FetchLike } from "./jsonModels";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
/** Fast, inexpensive and supports JSON mode. Override with GROQ_MODEL. */
const DEFAULT_MODEL = "openai/gpt-oss-20b";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/** Asks a Groq-hosted model for a JSON object and returns it parsed. */
export async function groqJson(
  messages: ChatMessage[],
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
  const payload = await postJson(
    GROQ_URL,
    { Authorization: `Bearer ${requireEnv("GROQ_API_KEY")}` },
    {
      model,
      messages,
      temperature: 0.2,
      max_completion_tokens: 1024,
      response_format: { type: "json_object" },
      // Reasoning models spend tokens thinking; keep the on-camera latency low.
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    },
    fetchImpl,
  ) as GroqResponse;

  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new UpstreamError("The model returned an empty response.");
  return parseModelJson(content);
}
