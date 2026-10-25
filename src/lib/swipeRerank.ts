export const RERANK_LIMITS = { contextChars: 300, minCandidates: 2, maxCandidates: 8, wordChars: 24 } as const;

export interface RerankRequest {
  /** The sentence so far. */
  context: string;
  /** Words the swipe decoder considered, best first. */
  candidates: string[];
}

export class RerankValidationError extends Error {}

/** Validates an incoming rerank request body. */
export function parseRerankRequest(raw: unknown): RerankRequest {
  if (typeof raw !== "object" || raw === null) throw new RerankValidationError("Body must be a JSON object.");
  const { context, candidates } = raw as Record<string, unknown>;
  if (context !== undefined && typeof context !== "string") throw new RerankValidationError('"context" must be a string.');
  if (!Array.isArray(candidates)) throw new RerankValidationError('"candidates" must be an array.');

  const words = [...new Set(candidates.filter((item): item is string => typeof item === "string").map((word) => word.toLowerCase()))];
  if (words.some((word) => !/^[a-z]+$/.test(word) || word.length > RERANK_LIMITS.wordChars)) {
    throw new RerankValidationError("Candidates must be lowercase words.");
  }
  if (words.length < RERANK_LIMITS.minCandidates || words.length > RERANK_LIMITS.maxCandidates) {
    throw new RerankValidationError(`Provide ${RERANK_LIMITS.minCandidates}-${RERANK_LIMITS.maxCandidates} candidates.`);
  }
  return { context: (context ?? "").replace(/\s+/g, " ").trim().slice(-RERANK_LIMITS.contextChars), candidates: words };
}

/**
 * Orders the model's answer using only words that were actually candidates,
 * then appends any it left out in their original order, so the result is
 * always a permutation of the input.
 */
export function mergeRanking(raw: unknown, candidates: readonly string[]): string[] {
  const proposed = typeof raw === "object" && raw !== null && Array.isArray((raw as { ranked?: unknown }).ranked)
    ? ((raw as { ranked: unknown[] }).ranked)
    : [];
  const allowed = new Set(candidates);
  const ordered: string[] = [];
  for (const item of proposed) {
    const word = typeof item === "string" ? item.toLowerCase().trim() : "";
    if (allowed.has(word) && !ordered.includes(word)) ordered.push(word);
  }
  for (const word of candidates) if (!ordered.includes(word)) ordered.push(word);
  return ordered;
}
