// Production vision endpoint: same request/response contract as
// src/app/api/vision/identify/route.ts, but pointed at the AWS Lambda
// Function URL when NEXT_PUBLIC_VISION_ENDPOINT is set at build time.
// The local /api route stays the dev path; this is the serverless path.

export interface IdentifyImage {
  data: string; // base64, no data: prefix
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface IdentifyResult {
  object: string;
  confidence: 'high' | 'medium' | 'low';
  sentence: string;
  alternatives: string[];
}

const ENDPOINT = process.env.NEXT_PUBLIC_VISION_ENDPOINT ?? '';

/** POSTs to the AWS Lambda Function URL and returns the parsed result. */
export async function identifyViaEndpoint(
  focus: IdentifyImage,
  context?: IdentifyImage | null,
): Promise<IdentifyResult> {
  if (!ENDPOINT) throw new Error('NEXT_PUBLIC_VISION_ENDPOINT is not set.');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ focus, context: context ?? undefined }),
  });
  if (!res.ok) throw new Error('Vision endpoint returned ' + res.status);
  const json = (await res.json()) as IdentifyResult;
  if (!json || typeof json.object !== 'string') throw new Error('Vision endpoint gave an unusable answer.');
  return json;
}
