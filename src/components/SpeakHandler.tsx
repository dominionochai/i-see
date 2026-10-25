"use client";
import { useEffect, useState } from "react";
import { useIrisStore } from "@/store/useIrisStore";
import { webLlmService } from "@/utils/webLlmService";
import { ttsService } from "@/utils/ttsService";
import { GazeButton } from "./GazeButton";
import { Volume2 } from "lucide-react";

export function SpeakHandler() {
  const { selectedNodes, clearNodes, llmReady, llmStatus } = useIrisStore();
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    webLlmService.init();
  }, []);

  useEffect(() => {
    const el = document.getElementById("speak-block");
    const handleDwell = async () => {
      if (!llmReady || selectedNodes.length === 0 || isSpeaking) return;
      
      setIsSpeaking(true);
      setLocalStatus("Generating…");
      try {
        const sentence = await webLlmService.generate(selectedNodes);
        setLocalStatus("Speaking…");
        useIrisStore.getState().setGeneratedSpeech(sentence);
        await ttsService.speak(sentence);
        clearNodes();
        setIsSpeaking(false);
        setLocalStatus(null);
      } catch (e) {
        console.error(e);
        clearNodes();
        setIsSpeaking(false);
        setLocalStatus(null);
      }
    };

    el?.addEventListener('dwell-click', handleDwell);
    return () => el?.removeEventListener('dwell-click', handleDwell);
  }, [selectedNodes, llmReady, isSpeaking, clearNodes]);

  const canSpeak = llmReady && selectedNodes.length > 0 && !isSpeaking;

  return (
    <div className="flex flex-col gap-2 w-full h-full justify-center">
      <GazeButton
        id="speak-block"
        data-disabled={!canSpeak}
        customDwellTime={800}
        icon={Volume2}
        className="w-full h-full"
        accentColor="#1FB57A" // bright green
        textColor="black"
        text="SPEAK"
      />
      <div className="text-[11px] text-[var(--iris-text-muted)] text-center font-[var(--font-geist-mono)] tracking-wide truncate h-5 shrink-0 leading-5">
        {localStatus || llmStatus}
      </div>
    </div>
  );
}
