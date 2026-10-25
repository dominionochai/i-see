import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { POST as agentStep } from "@/app/api/agent/step/route";
import { POST as identify } from "@/app/api/vision/identify/route";
import { GET as getFrame, POST as postFrame } from "@/app/api/scene/frame/route";
import { clearSceneFrame } from "@/lib/server/sceneStore";
import { parseVisionResult } from "../vision";

const realFetch = globalThis.fetch;
const env = { ...process.env };
let upstream: Array<{ url: string; init: RequestInit }> = [];

/** Replaces fetch with a canned upstream reply and records the calls. */
function stubUpstream(reply: () => Response) {
  upstream = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    upstream.push({ url: String(url), init: init ?? {} });
    return reply();
  }) as typeof fetch;
}

const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const groqReply = (content: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
const geminiReply = (content: unknown) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(content) }] } }] });

beforeEach(() => {
  process.env.GROQ_API_KEY = "groq-test";
  process.env.GEMINI_API_KEY = "gemini-test";
  delete process.env.GROQ_MODEL;
  delete process.env.GEMINI_MODEL;
  clearSceneFrame();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
});

const stepBody = {
  goal: "Like Sam's sunset post",
  targets: [{ id: "like-p1", label: "Like Sam's post", kind: "button" }],
  history: [],
};

describe("POST /api/agent/step", () => {
  it("returns a validated step and calls Groq with the key and JSON mode", async () => {
    stubUpstream(() => groqReply({ thought: "Found the like button", action: { type: "click", target: "like-p1" } }));
    const response = await agentStep(post("/api/agent/step", stepBody));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { thought: "Found the like button", action: { type: "click", target: "like-p1" } });

    const call = upstream[0];
    assert.match(call.url, /api\.groq\.com\/openai\/v1\/chat\/completions$/);
    assert.equal((call.init.headers as Record<string, string>).Authorization, "Bearer groq-test");
    const sent = JSON.parse(String(call.init.body));
    assert.equal(sent.model, "openai/gpt-oss-20b");
    assert.deepEqual(sent.response_format, { type: "json_object" });
    assert.equal(sent.reasoning_effort, "low");
    assert.match(sent.messages[1].content, /like-p1/);
  });

  it("honours GROQ_MODEL and omits reasoning_effort for other models", async () => {
    process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
    stubUpstream(() => groqReply({ thought: "", action: { type: "done", summary: "ok" } }));
    await agentStep(post("/api/agent/step", stepBody));
    const sent = JSON.parse(String(upstream[0].init.body));
    assert.equal(sent.model, "llama-3.3-70b-versatile");
    assert.equal("reasoning_effort" in sent, false);
  });

  it("rejects a planner action that targets something not on screen with 502", async () => {
    stubUpstream(() => groqReply({ thought: "", action: { type: "click", target: "delete-everything" } }));
    const response = await agentStep(post("/api/agent/step", stepBody));
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /invalid action/);
  });

  it("returns 400 for bad requests without calling the provider", async () => {
    stubUpstream(() => groqReply({}));
    assert.equal((await agentStep(post("/api/agent/step", { goal: "", targets: [] }))).status, 400);
    assert.equal((await agentStep(new Request("http://localhost/api/agent/step", { method: "POST", body: "not json" }))).status, 400);
    assert.equal(upstream.length, 0);
  });

  it("returns 503 naming the missing key", async () => {
    delete process.env.GROQ_API_KEY;
    const response = await agentStep(post("/api/agent/step", stepBody));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /GROQ_API_KEY/);
  });

  it("maps provider failures and non-JSON answers to 502", async () => {
    stubUpstream(() => new Response("rate limited", { status: 429 }));
    assert.equal((await agentStep(post("/api/agent/step", stepBody))).status, 502);
    stubUpstream(() => Response.json({ choices: [{ message: { content: "sorry, no json" } }] }));
    assert.equal((await agentStep(post("/api/agent/step", stepBody))).status, 502);
  });

  it("accepts JSON wrapped in a code fence", async () => {
    stubUpstream(() => Response.json({ choices: [{ message: { content: '```json\n{"thought":"t","action":{"type":"done","summary":"ok"}}\n```' } }] }));
    const response = await agentStep(post("/api/agent/step", stepBody));
    assert.equal(response.status, 200);
  });
});

const tinyImage = { data: Buffer.from("fake-jpeg-bytes").toString("base64"), mimeType: "image/jpeg" };

describe("POST /api/vision/identify", () => {
  it("sends both images to Gemini and returns a clean result", async () => {
    stubUpstream(() => geminiReply({ object: "pill bottle", confidence: "high", sentence: "Can I have my medication, please?", alternatives: ["Is it time for my pills?"] }));
    const response = await identify(post("/api/vision/identify", { focus: tinyImage, context: tinyImage }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "pill bottle", confidence: "high", sentence: "Can I have my medication, please?", alternatives: ["Is it time for my pills?"],
    });

    const call = upstream[0];
    assert.match(call.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent$/);
    assert.equal((call.init.headers as Record<string, string>)["x-goog-api-key"], "gemini-test");
    const sent = JSON.parse(String(call.init.body));
    assert.equal(sent.generationConfig.responseMimeType, "application/json");
    assert.equal(sent.contents[0].parts.filter((part: { inlineData?: unknown }) => part.inlineData).length, 2);
  });

  it("works with only the focus crop", async () => {
    stubUpstream(() => geminiReply({ object: "cup", sentence: "Could I have some water, please?" }));
    const response = await identify(post("/api/vision/identify", { focus: tinyImage }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).confidence, "medium");
  });

  it("validates images", async () => {
    stubUpstream(() => geminiReply({}));
    for (const body of [
      {},
      { focus: { data: "data:image/jpeg;base64,AAAA", mimeType: "image/jpeg" } },
      { focus: { ...tinyImage, mimeType: "image/gif" } },
      { focus: { data: "A".repeat(2_100_000), mimeType: "image/jpeg" } },
    ]) {
      assert.equal((await identify(post("/api/vision/identify", body))).status, 400, JSON.stringify(body).slice(0, 60));
    }
    assert.equal(upstream.length, 0);
  });

  it("returns 502 when the model answer is unusable and 503 without a key", async () => {
    stubUpstream(() => geminiReply({ nothing: true }));
    assert.equal((await identify(post("/api/vision/identify", { focus: tinyImage }))).status, 502);
    delete process.env.GEMINI_API_KEY;
    assert.equal((await identify(post("/api/vision/identify", { focus: tinyImage }))).status, 503);
  });
});

describe("parseVisionResult", () => {
  it("clips text, limits alternatives and defaults confidence", () => {
    const result = parseVisionResult({ object: "cup", sentence: "x".repeat(400), alternatives: ["a", "b", "c", "d", " "], confidence: "bogus" });
    assert.ok(result);
    assert.equal(result.sentence.length, 160);
    assert.deepEqual(result.alternatives, ["a", "b", "c"]);
    assert.equal(result.confidence, "medium");
  });
  it("rejects results missing an object or sentence", () => {
    assert.equal(parseVisionResult({ object: "cup" }), null);
    assert.equal(parseVisionResult(null), null);
  });
});

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const frameRequest = (bytes: Uint8Array) => new Request("http://localhost/api/scene/frame", { method: "POST", body: bytes as BodyInit });

describe("/api/scene/frame", () => {
  it("is empty until a frame arrives", async () => {
    assert.equal((await getFrame(new Request("http://localhost/api/scene/frame"))).status, 204);
  });

  it("stores a JPEG and serves it, then 204s when nothing is newer", async () => {
    const stored = await (await postFrame(frameRequest(jpegBytes))).json();
    const response = await getFrame(new Request("http://localhost/api/scene/frame"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(response.headers.get("x-frame-id"), String(stored.id));
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), jpegBytes);

    const unchanged = await getFrame(new Request(`http://localhost/api/scene/frame?since=${stored.id}`));
    assert.equal(unchanged.status, 204);
    await postFrame(frameRequest(jpegBytes));
    assert.equal((await getFrame(new Request(`http://localhost/api/scene/frame?since=${stored.id}`))).status, 200);
  });

  it("rejects non-images, empty and oversized frames", async () => {
    assert.equal((await postFrame(frameRequest(new TextEncoder().encode("<script>")))).status, 400);
    assert.equal((await postFrame(frameRequest(new Uint8Array(0)))).status, 400);
    assert.equal((await postFrame(frameRequest(new Uint8Array([0xff, 0xd8, 0xff, ...new Array(1_600_000).fill(1)])))).status, 400);
  });

  it("is disabled in production unless enabled", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    assert.equal((await postFrame(frameRequest(jpegBytes))).status, 404);
    assert.equal((await getFrame(new Request("http://localhost/api/scene/frame"))).status, 404);
    process.env.ENABLE_SCENE_RELAY = "1";
    assert.equal((await postFrame(frameRequest(jpegBytes))).status, 200);
  });
});

import { POST as rerank } from "@/app/api/keyboard/rerank/route";
import { mergeRanking, parseRerankRequest } from "../swipeRerank";

describe("POST /api/keyboard/rerank", () => {
  it("returns the model's order, restricted to the candidates", async () => {
    stubUpstream(() => groqReply({ ranked: ["water", "hello", "invented", "water"] }));
    const response = await rerank(post("/api/keyboard/rerank", { context: "can I have some", candidates: ["hello", "water", "waiter"] }));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).ranked, ["water", "hello", "waiter"]);
    assert.match(String(JSON.parse(String(upstream[0].init.body)).messages[1].content), /can I have some/);
  });

  it("validates input and maps provider failure", async () => {
    stubUpstream(() => groqReply({ ranked: [] }));
    assert.equal((await rerank(post("/api/keyboard/rerank", { candidates: ["one"] }))).status, 400);
    assert.equal((await rerank(post("/api/keyboard/rerank", { candidates: ["ok", "NOT OK!"] }))).status, 400);
    assert.equal((await rerank(post("/api/keyboard/rerank", { candidates: "nope" }))).status, 400);
    stubUpstream(() => new Response("down", { status: 500 }));
    assert.equal((await rerank(post("/api/keyboard/rerank", { candidates: ["a", "b"] }))).status, 502);
  });
});

describe("swipe rerank helpers", () => {
  it("always returns a permutation of the candidates", () => {
    assert.deepEqual(mergeRanking({ ranked: ["b"] }, ["a", "b", "c"]), ["b", "a", "c"]);
    assert.deepEqual(mergeRanking(null, ["a", "b"]), ["a", "b"]);
    assert.deepEqual(mergeRanking({ ranked: "b" }, ["a", "b"]), ["a", "b"]);
  });
  it("normalises requests", () => {
    const request = parseRerankRequest({ context: "  hi   there ", candidates: ["Hello", "hello", "hallo"] });
    assert.deepEqual(request, { context: "hi there", candidates: ["hello", "hallo"] });
  });
});
