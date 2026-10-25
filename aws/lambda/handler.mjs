// I-See vision identify, packaged as a standalone AWS Lambda function.
// Deploy: Node.js 18.x runtime, arm64 architecture. No dependencies - uses
// the built-in fetch. Reads GEMINI_API_KEY from the function env vars.
// Responds to GET (health probe) and POST (identify), with CORS enabled for
// a Lambda Function URL.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BASE64_CHARS = Math.ceil((MAX_BODY_BYTES * 4) / 3);

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

const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';

function parseImage(value, name, required) {
  if (value === undefined || value === null) {
    if (required) {
      const e = new Error('"' + name + '" is required.');
      e.code = 'BAD_REQUEST';
      throw e;
    }
    return null;
  }
  if (typeof value !== 'object') {
    const e = new Error('"' + name + '" must be an object.');
    e.code = 'BAD_REQUEST';
    throw e;
  }
  const data = value.data;
  const mimeType = value.mimeType;
  if (typeof data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    const e = new Error('"' + name + '.data" must be base64 without a data: prefix.');
    e.code = 'BAD_REQUEST';
    throw e;
  }
  if (data.length > MAX_BASE64_CHARS) {
    const e = new Error('"' + name + '" is too large.');
    e.code = 'BAD_REQUEST';
    throw e;
  }
  if (typeof mimeType !== 'string' || !ALLOWED_MIME.has(mimeType)) {
    const e = new Error('"' + name + '.mimeType" must be image/jpeg, image/png or image/webp.');
    e.code = 'BAD_REQUEST';
    throw e;
  }
  return { data, mimeType };
}

function parseVisionResult(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (typeof parsed.object !== 'string' || typeof parsed.confidence !== 'string' || typeof parsed.sentence !== 'string') return null;
  if (!['high', 'medium', 'low'].includes(parsed.confidence)) return null;
  if (!Array.isArray(parsed.alternatives)) return null;
  return {
    object: parsed.object,
    confidence: parsed.confidence,
    sentence: parsed.sentence,
    alternatives: parsed.alternatives.slice(0, 3).filter((a) => typeof a === 'string'),
  };
}

async function geminiJson(parts) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const e = new Error('GEMINI_API_KEY is not set on the Lambda.');
    e.code = 'NO_KEY';
    throw e;
  }
  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(GEMINI_URL + '?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      const e = new Error('Gemini upstream error ' + res.status);
      e.code = 'UPSTREAM';
      throw e;
    }
    const json = await res.json();
    const text = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] ? json.candidates[0].content.parts[0].text : '';
    const result = parseVisionResult(text);
    if (!result) {
      const e = new Error('The vision model gave an unusable answer.');
      e.code = 'UPSTREAM';
      throw e;
    }
    return result;
  }
  const e = new Error('Gemini kept rate-limiting; giving up after retries.');
  e.code = 'UPSTREAM';
  throw e;
}

async function identify(body) {
  const focus = parseImage(body.focus, 'focus', true);
  const context = parseImage(body.context, 'context', false);
  const parts = [{ text: PROMPT }, { inlineData: { mimeType: focus.mimeType, data: focus.data } }];
  if (context) parts.push({ inlineData: { mimeType: context.mimeType, data: context.data } });
  return geminiJson(parts);
}

export const handler = async (event) => {
  const method = (event && (event.requestContext && event.requestContext.http && event.requestContext.http.method)) || (event && event.httpMethod) || 'GET';

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (method === 'GET') {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ ok: true, service: 'i-see vision identify (AWS Lambda, arm64)', version: '1.0.0' }),
    };
  }
  if (method !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'method not allowed' }) };
  }

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'invalid JSON body' }) };
  }

  try {
    const result = await identify(body);
    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (err) {
    const status = err.code === 'BAD_REQUEST' ? 400 : err.code === 'NO_KEY' ? 503 : 502;
    return { statusCode: status, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
