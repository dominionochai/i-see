import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialSocialState } from "../social/mockFeed";
import { socialReducer } from "../social/socialReducer";
import { getPredictions } from "../wordPrediction";
import { gazeTextReducer, INITIAL_GAZE_TEXT, MAX_DRAFT_LENGTH } from "../gazeTextReducer";

describe("socialReducer", () => {
  it("toggles likes both ways", () => {
    const start = createInitialSocialState();
    const liked = socialReducer(start, { type: "toggle-like", postId: "p1" });
    assert.equal(liked.posts[0].likes, start.posts[0].likes + 1);
    assert.equal(socialReducer(liked, { type: "toggle-like", postId: "p1" }).posts[0].likes, start.posts[0].likes);
  });
  it("adds posts, comments and messages, ignoring blanks", () => {
    let s = createInitialSocialState();
    assert.equal(socialReducer(s, { type: "add-post", body: "  ", id: "x" }), s);
    s = socialReducer(s, { type: "add-post", body: "Good morning", id: "n1" });
    assert.equal(s.posts[0].body, "Good morning");
    s = socialReducer(s, { type: "add-comment", postId: "p2", body: "Can't wait", id: "c9" });
    assert.equal(s.posts.find((p) => p.id === "p2")?.comments.at(-1)?.body, "Can't wait");
    s = socialReducer(s, { type: "send-message", friendId: "maya", from: "me", body: "Feeling better", id: "m9" });
    assert.equal(s.threads.maya.at(-1)?.body, "Feeling better");
  });
  it("does not mutate the previous state", () => {
    const start = createInitialSocialState();
    const snapshot = JSON.stringify(start);
    socialReducer(start, { type: "toggle-like", postId: "p1" });
    assert.equal(JSON.stringify(start), snapshot);
  });
});

describe("word prediction", () => {
  it("continues known words, deduplicated and padded", () => {
    assert.deepEqual(getPredictions("", "i"), ["am", "want", "need"]);
    assert.equal(new Set(getPredictions("", "thank")).size, 3);
    assert.deepEqual(getPredictions("TH", ""), ["the", "that", "this"]);
    assert.deepEqual(getPredictions("zzz", ""), []);
  });
});

describe("gazeTextReducer", () => {
  it("builds a sentence from letters, spaces and words", () => {
    let s = gazeTextReducer(INITIAL_GAZE_TEXT, { type: "letter", letter: "H" });
    s = gazeTextReducer(s, { type: "letter", letter: "i" });
    s = gazeTextReducer(s, { type: "space" });
    s = gazeTextReducer(s, { type: "word", word: "there" });
    assert.equal(s.sentence, "hi there ");
    assert.equal(gazeTextReducer(s, { type: "space" }), s);
  });
  it("backspaces the draft, then the sentence", () => {
    assert.deepEqual(gazeTextReducer({ sentence: "hi ", draft: "ab" }, { type: "backspace" }), { sentence: "hi ", draft: "a" });
    assert.deepEqual(gazeTextReducer({ sentence: "hi there ", draft: "" }, { type: "backspace" }), { sentence: "hi ther", draft: "" });
  });
  it("caps the draft and clears", () => {
    const full = { sentence: "", draft: "a".repeat(MAX_DRAFT_LENGTH) };
    assert.equal(gazeTextReducer(full, { type: "letter", letter: "b" }), full);
    assert.deepEqual(gazeTextReducer({ sentence: "x ", draft: "y" }, { type: "clear" }), INITIAL_GAZE_TEXT);
  });
});
