import { UpstreamError } from "./errors";

export type FetchLike = typeof fetch;

const DEFAULT_TIMEOUT_MS = 20_000;

/** Extracts a JSON value from model output, tolerating Markdown code fences. */
export function parseModelJson(text: string): unknown {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(stripped);
  } catch {
    throw new UpstreamError("The model did not return valid JSON.");
  }
}

/** POSTs JSON with a timeout and returns the parsed response, mapping failures to {@link UpstreamError}. */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  fetchImpl: FetchLike,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new UpstreamError(timedOut ? "The AI provider timed out." : "Could not reach the AI provider.");
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new UpstreamError(`The AI provider returned ${response.status}. ${detail}`.trim(), response.status);
  }
  return response.json();
}
