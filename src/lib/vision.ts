export type VisionConfidence = "high" | "medium" | "low";

export interface VisionResult {
  /** Short name of what the person is looking at, e.g. "pill bottle". */
  object: string;
  confidence: VisionConfidence;
  /** What the person most likely wants to say, in first person. */
  sentence: string;
  /** Other things they might want to say about it. */
  alternatives: string[];
}

export const VISION_LIMITS = {
  imageBytes: 1_500_000,
  textChars: 160,
  alternatives: 3,
} as const;

const CONFIDENCES: readonly VisionConfidence[] = ["high", "medium", "low"];

const clip = (value: unknown, max: number = VISION_LIMITS.textChars) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Validates the vision model's JSON reply. Returns null when it lacks a usable object and sentence. */
export function parseVisionResult(raw: unknown): VisionResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const object = clip(source.object, 60);
  const sentence = clip(source.sentence);
  if (!object || !sentence) return null;

  const confidence = CONFIDENCES.find((level) => level === source.confidence) ?? "medium";
  const alternatives = Array.isArray(source.alternatives)
    ? source.alternatives.map((item) => clip(item)).filter(Boolean).slice(0, VISION_LIMITS.alternatives)
    : [];
  return { object, confidence, sentence, alternatives };
}
