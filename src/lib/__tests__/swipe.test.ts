import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeSwipe, idealPath, pathLength, resample } from "../swipe/decoder";
import { KEY_CENTERS, type KeyPoint } from "../swipe/layout";
import { LEXICON } from "../swipe/lexicon";

/** Small deterministic PRNG so accuracy figures are repeatable. */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
const gaussian = (random: () => number) => Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random());

/** A plausible gaze swipe: the ideal path, sampled at an irregular pace, with tracker jitter and a lazy start/end. */
function noisySwipe(word: string, random: () => number, jitter = 0.3): KeyPoint[] {
  const ideal = resample(idealPath(word), 60);
  const smoothed: KeyPoint[] = [];
  let drift = { x: 0, y: 0 };
  for (const point of ideal) {
    drift = { x: drift.x * 0.8 + gaussian(random) * jitter * 0.6, y: drift.y * 0.8 + gaussian(random) * jitter * 0.6 };
    smoothed.push({ x: point.x + drift.x, y: point.y + drift.y });
  }
  return smoothed.filter(() => random() > 0.15);
}

const TEST_WORDS = [
  "hello", "water", "please", "thank", "help", "pain", "tired", "hungry", "doctor", "family", "love", "cold", "toilet",
  "medicine", "today", "tomorrow", "bathroom", "blanket", "comfortable", "sorry", "yes", "okay", "good", "morning", "night",
  "drink", "coffee", "music", "light", "window", "phone", "call", "home", "friend", "happy", "nurse", "pillow", "wait", "stop",
];

describe("swipe decoder", () => {
  it("has a lexicon of lowercase words with no duplicates", () => {
    assert.ok(LEXICON.length > 450, `size ${LEXICON.length}`);
    assert.equal(new Set(LEXICON.map((entry) => entry.word)).size, LEXICON.length);
    assert.ok(LEXICON.every((entry) => /^[a-z]+$/.test(entry.word) && [...entry.word].every((c) => KEY_CENTERS[c])));
  });

  it("resamples to equally spaced points", () => {
    const points = resample([{ x: 0, y: 0 }, { x: 10, y: 0 }], 11);
    assert.equal(points.length, 11);
    assert.ok(points.every((p, i) => Math.abs(p.x - i) < 1e-9));
    assert.equal(resample([{ x: 1, y: 2 }], 5).length, 5);
    assert.deepEqual(resample([], 5), []);
  });

  it("builds ideal paths without repeated letters", () => {
    assert.equal(idealPath("hello").length, 4);
    assert.ok(pathLength(idealPath("hello")) > 0);
  });

  it("decodes a clean swipe exactly", () => {
    for (const word of ["hello", "water", "doctor"]) {
      assert.equal(decodeSwipe(idealPath(word))[0].word, word);
    }
  });

  it("decodes taps on single-letter words", () => {
    const tap = [{ ...KEY_CENTERS.i }, { ...KEY_CENTERS.i }];
    assert.equal(decodeSwipe(tap)[0].word, "i");
  });

  it("returns nothing for an empty path and respects the limit", () => {
    assert.deepEqual(decodeSwipe([]), []);
    assert.ok(decodeSwipe(idealPath("hello"), { limit: 3 }).length <= 3);
  });

  /** Top-1 and top-5 rates over every test word at a given tracker jitter (in key widths). */
  function accuracy(jitter: number, seed: number) {
    const random = rng(seed);
    let top1 = 0;
    let top5 = 0;
    let total = 0;
    for (const word of TEST_WORDS) {
      for (let trial = 0; trial < 20; trial += 1) {
        const ranked = decodeSwipe(noisySwipe(word, random, jitter), { limit: 5 }).map((c) => c.word);
        total += 1;
        if (ranked[0] === word) top1 += 1;
        if (ranked.includes(word)) top5 += 1;
      }
    }
    return { top1: top1 / total, top5: top5 / total, total };
  }

  it("is accurate on gaze swipes with modest tracker jitter", () => {
    const { top1, top5, total } = accuracy(0.3, 42);
    console.log(`jitter 0.3 key widths, ${total} swipes: top-1 ${(100 * top1).toFixed(1)}%, top-5 ${(100 * top5).toFixed(1)}%`);
    assert.ok(top5 > 0.9, `top-5 ${top5}`);
    assert.ok(top1 > 0.6, `top-1 ${top1}`);
  });

  it("degrades gracefully as jitter grows (reported, not a pass mark)", () => {
    for (const jitter of [0.6, 1.0]) {
      const { top1, top5 } = accuracy(jitter, 7);
      console.log(`jitter ${jitter} key widths: top-1 ${(100 * top1).toFixed(1)}%, top-5 ${(100 * top5).toFixed(1)}%`);
    }
    assert.ok(accuracy(0.6, 7).top5 > accuracy(1.0, 7).top5 - 1e-9, "more noise should not help");
  });
});
