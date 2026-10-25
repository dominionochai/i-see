import { KEY_CENTERS, type KeyPoint } from "./layout";
import { LEXICON, type LexiconEntry } from "./lexicon";

/** Points per path after resampling. */
const SAMPLES = 32;
/** The path must start and end this close (key widths) to the word's first and last keys. */
const ENDPOINT_RADIUS = 1.7;
/** Weight of the shape distance, the length mismatch and the word-frequency prior. */
const SHAPE_WEIGHT = 1;
const LENGTH_WEIGHT = 0.35;
const FREQUENCY_WEIGHT = 0.06;
/** Paths shorter than this (key widths) are treated as a tap on a single key. */
const TAP_LENGTH = 0.6;

export interface Candidate {
  word: string;
  /** Lower is better. */
  score: number;
}

export interface DecodeOptions {
  /** Maximum candidates returned. */
  limit?: number;
  lexicon?: readonly LexiconEntry[];
}

const distance = (a: KeyPoint, b: KeyPoint) => Math.hypot(a.x - b.x, a.y - b.y);

export function pathLength(points: readonly KeyPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

/** Resamples a polyline to `count` points equally spaced along its length. */
export function resample(points: readonly KeyPoint[], count = SAMPLES): KeyPoint[] {
  if (points.length === 0) return [];
  const total = pathLength(points);
  if (points.length === 1 || total === 0) return Array.from({ length: count }, () => ({ ...points[0] }));

  const step = total / (count - 1);
  const result: KeyPoint[] = [{ ...points[0] }];
  let travelled = 0;
  let next = step;
  for (let i = 1; i < points.length && result.length < count; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const segment = distance(from, to);
    while (segment > 0 && travelled + segment >= next && result.length < count) {
      const t = (next - travelled) / segment;
      result.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      next += step;
    }
    travelled += segment;
  }
  while (result.length < count) result.push({ ...points[points.length - 1] });
  return result;
}

/** The path a perfect swipe of `word` would take: through each key, collapsing repeated letters. */
export function idealPath(word: string): KeyPoint[] {
  const path: KeyPoint[] = [];
  let previous = "";
  for (const letter of word) {
    const center = KEY_CENTERS[letter];
    if (!center || letter === previous) continue;
    path.push(center);
    previous = letter;
  }
  return path;
}

/**
 * Ranks lexicon words for a gaze path (key-width coordinates). Candidates must
 * start and end near the word's first and last keys; the rest is ordered by
 * how closely the path follows the word's ideal path, with a small preference
 * for frequent words.
 */
export function decodeSwipe(path: readonly KeyPoint[], options: DecodeOptions = {}): Candidate[] {
  const { limit = 8, lexicon = LEXICON } = options;
  if (path.length === 0) return [];

  const userLength = pathLength(path);
  const user = resample(path);
  const first = path[0];
  const last = path[path.length - 1];
  const tap = userLength < TAP_LENGTH;
  const candidates: Candidate[] = [];

  for (const { word, rank } of lexicon) {
    const ideal = idealPath(word);
    if (ideal.length === 0) continue;
    const idealFirst = ideal[0];
    const idealLast = ideal[ideal.length - 1];
    if (distance(first, idealFirst) > ENDPOINT_RADIUS || distance(last, idealLast) > ENDPOINT_RADIUS) continue;

    const idealLength = pathLength(ideal);
    if (tap && ideal.length > 1) continue;
    if (!tap && ideal.length === 1) continue;

    let shape = 0;
    let lengthMismatch = 0;
    if (!tap) {
      const reference = resample(ideal);
      for (let i = 0; i < SAMPLES; i += 1) shape += distance(user[i], reference[i]);
      shape /= SAMPLES;
      lengthMismatch = Math.abs(Math.log((userLength + 0.5) / (idealLength + 0.5)));
    } else {
      shape = distance(first, idealFirst);
    }

    candidates.push({
      word,
      score: SHAPE_WEIGHT * shape + LENGTH_WEIGHT * lengthMismatch + FREQUENCY_WEIGHT * Math.log(rank + 8),
    });
  }

  return candidates.sort((a, b) => a.score - b.score).slice(0, limit);
}
