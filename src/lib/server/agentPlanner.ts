import { AgentValidationError, type AgentStepRequest, type PlannedStep } from "@/lib/agent/types";
import { parsePlannedStep } from "@/lib/agent/validate";
import { UpstreamError } from "./errors";
import { buildAgentMessages } from "./agentPrompt";
import { groqJson } from "./groq";

/** Asks the planner model for the next on-screen action and validates it against what is visible. */
export async function planStep(request: AgentStepRequest): Promise<PlannedStep> {
  const reply = await groqJson(buildAgentMessages(request));
  try {
    return parsePlannedStep(reply, request.targets);
  } catch (error) {
    if (error instanceof AgentValidationError) {
      throw new UpstreamError(`The planner suggested an invalid action: ${error.message}`);
    }
    throw error;
  }
}
