import { BadRequestError } from "@/lib/server/errors";
import { getBrowserRuns } from "@/lib/server/browserRuns";
import { errorResponse, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

/**
 * Opening a browser on the host machine is powerful and this endpoint has no
 * authentication, so it only runs in development unless explicitly enabled.
 */
const isEnabled = () => process.env.NODE_ENV !== "production" || process.env.ENABLE_BROWSER_AGENT === "1";
const disabled = () => json({ error: "The browser agent is disabled in production." }, 404);

const runIdFrom = (request: Request) => new URL(request.url).searchParams.get("run") ?? "";

/** Starts an agent in a real browser. Body: `{ "goal": "…" }`. Poll with GET. */
export async function POST(request: Request) {
  if (!isEnabled()) return disabled();
  try {
    const body = await readJson(request, MAX_BODY_BYTES);
    if (typeof body !== "object" || body === null) throw new BadRequestError("Body must be a JSON object.");
    const snapshot = getBrowserRuns().start((body as { goal?: unknown }).goal, new URL(request.url).origin);
    return json(snapshot, 202);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Progress of a run: `GET ?run=<id>`. */
export async function GET(request: Request) {
  if (!isEnabled()) return disabled();
  const snapshot = getBrowserRuns().get(runIdFrom(request));
  return snapshot ? json(snapshot) : json({ error: "Unknown run." }, 404);
}

/** Stops a run and closes its browser: `DELETE ?run=<id>`. */
export async function DELETE(request: Request) {
  if (!isEnabled()) return disabled();
  return getBrowserRuns().cancel(runIdFrom(request)) ? json({ ok: true }) : json({ error: "Unknown run." }, 404);
}
