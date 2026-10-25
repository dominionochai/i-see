"use client";

import { AgentBridge } from "@/components/AgentBridge";
import { SocialPanel } from "@/components/social/SocialPanel";

/**
 * A stand-alone copy of the demo social site. The real-browser agent opens this
 * page in a visible Chrome window and drives it with real clicks and keystrokes.
 */
export default function MockSocialPage() {
  return (
    <>
      <AgentBridge />
      <SocialPanel showAgentBar={false} />
    </>
  );
}
