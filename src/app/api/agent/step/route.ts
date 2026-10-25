import { parseStepRequest } from "@/lib/agent/validate";
import { AgentValidationError } from "@/lib/agent/types";
import { BadRequestError } from "@/lib/server/errors";
import { planStep } from "@/lib/server/agentPlanner";
import { errorResponse, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 64 * 1024;

/** Plans the agent's next on-screen action from the goal, history and visible controls. */
export async function POST(request: Request) {
  try {
    const raw = await readJson(request, MAX_BODY_BYTES);
    let stepRequest;
    try {
      stepRequest = parseStepRequest(raw);
    } catch (error) {
      if (error instanceof AgentValidationError) throw new BadRequestError(error.message);
      throw error;
    }
    return json(await planStep(stepRequest));
  } catch (error) {
    return errorResponse(error);
  }
}
