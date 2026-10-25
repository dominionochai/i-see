import { CreateMLCEngine, InitProgressReport, MLCEngine } from "@mlc-ai/web-llm";
import { useIrisStore } from "@/store/useIrisStore";

class WebLlmService {
  private engine: MLCEngine | null = null;
  private isLoaded = false;
  private requestLock: Promise<void> = Promise.resolve();
  private initPromise: Promise<void> | null = null;
  
  private async enqueue<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.requestLock;
    let resolveLock!: () => void;
    this.requestLock = new Promise(r => { resolveLock = r; });
    
    try {
      await previous;
      const timeoutPromise = new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error("WebLLM request timed out")), 8000)
      );
      return await Promise.race([task(), timeoutPromise]);
    } finally {
      resolveLock();
    }
  }

  async init() {
    if (this.engine) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        this.engine = await CreateMLCEngine("Llama-3.2-1B-Instruct-q4f16_1-MLC", {
          initProgressCallback: (report: InitProgressReport) => {
            useIrisStore.getState().setLlmStatus(report.text);
            if (report.text.includes("Finish") || report.text.includes("Loaded")) {
              useIrisStore.getState().setLlmReady(true);
            }
          }
        });
        this.isLoaded = true;
        useIrisStore.getState().setLlmReady(true);
        useIrisStore.getState().setLlmStatus("Ready");
      } catch (e) {
        console.error(e);
        useIrisStore.getState().setLlmStatus("Failed to load model.");
      }
    })();

    return this.initPromise;
  }

  async generate(keywords: string[]): Promise<string> {
    if (!this.engine || !this.isLoaded) return "";

    // Bypass LLM entirely if the user selected a context-aware predictive response.
    // These are already fully formed short answers (e.g. "I don't know", "Yes, that's right").
    if (useIrisStore.getState().wasContextResponse) {
      return keywords.join(" ");
    }

    // Hardcode bypass for extremely basic single-word affirmations/negations
    // to prevent the 1B model from hallucinating unnecessary context.
    if (keywords.length === 1) {
      const word = keywords[0].toLowerCase();
      if (word === "yes") return "Yes.";
      if (word === "no") return "No.";
    }

    const systemMessage = `Your task is to translate short keywords into a single, natural, first-person spoken sentence ("I").
You are speaking as a human who needs assistance with daily tasks.
RULES:
1. Words like "Toilet", "Thirsty", or "Physical" mean you need help (e.g., "I need to go to the toilet", "I need some water", "Please adjust my position").
2. "Social" means you want to socialize, talk, or have company.
3. If the keyword is a simple greeting or answer like "Yes" or "No", just output that word directly. Do not invent extra requests.
4. Output ONLY the final spoken sentence. No quotes, no intro text, no conversational filler.`;

    const activeTone = useIrisStore.getState().activeTone;
    const toneInstruction = activeTone ? `Please apply a ${activeTone.toUpperCase()} tone to the sentence.` : "";

    const userPrompt = `Keywords: [${keywords.join(", ")}]
    
${toneInstruction}
Write the single sentence now:`;

    let temperature = 0.4; // Default predictable response
    if (activeTone === "Sarcastic") temperature = 0.8;
    else if (activeTone === "Joyful") temperature = 0.7;
    else if (activeTone === "Polite") temperature = 0.5;
    else if (activeTone === "Urgent") temperature = 0.3;

    try {
      const reply = await this.enqueue(() => this.engine!.chat.completions.create({
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 256, // Mitigate resource exhaustion by enforcing a strict token limit
        temperature,
      }));
      
      const choice = reply.choices[0];
      const message = choice.message as any;
      if (message.refusal) {
        console.warn("Model refused request:", message.refusal);
        return "";
      }

      return choice.message.content || "";
    } catch (error) {
      console.error("Local LLM Generation error:", error);
      return "";
    }
  }

  async predictNextWords(selectedNodes: string[]): Promise<void> {
    if (!this.engine || !this.isLoaded || selectedNodes.length === 0) return;

    useIrisStore.getState().setIsPredicting(true);

    const systemMessage = `You are a predictive text engine for an AAC device. Predict the next 3 most logical single-word concepts the user might want to say based on their selections. Output ONLY a comma-separated list of exactly 3 words. No pleasantries, no markdown.`;
    const userMessage = `Selected concepts: ${selectedNodes.join(", ")}`;
    
    try {
      const reply = await this.enqueue(() => this.engine!.chat.completions.create({
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage }
        ],
        max_tokens: 15, // Extremely low limit for speed
      }));

      const content = reply.choices[0]?.message?.content || "";
      const parsedArray = content.split(/,|\n/)
        .map(w => w.replace(/^\d+\.\s*/, "").replace(/["']/g, "").trim())
        .filter(w => w.length > 0)
        .slice(0, 3);
      
      useIrisStore.getState().setPredictions(parsedArray);
    } catch (error) {
      console.error("Local LLM Prediction error:", error);
    } finally {
      useIrisStore.getState().setIsPredicting(false);
    }
  }
  async predictFromAmbientContext(ambientContext: string): Promise<void> {
    if (!ambientContext) return;

    const lower = ambientContext.toLowerCase().trim();

    // --- JS-side question type detection (reliable, no LLM needed) ---
    const isYesNo = /^(are|is|do|does|did|can|could|will|would|have|has|were|was)\b/i.test(lower);

    // Environmental keyword → deterministic third button
    const envKeywords: Record<string, string> = {
      hot: "Please turn on the fan",
      warm: "Please turn on the fan",
      cold: "Please turn off the fan",
      chilly: "Please turn off the fan",
      dark: "Please turn on the light",
      dim: "Please turn on the light",
      bright: "Please turn off the light",
    };
    let envButton: string | null = null;
    for (const [kw, action] of Object.entries(envKeywords)) {
      if (lower.includes(kw)) { envButton = action; break; }
    }

    // If LLM not ready, use safe deterministic fallbacks
    if (!this.engine || !this.isLoaded) {
      const fallback = isYesNo
        ? ["Yes", "No", envButton ?? "I'm not sure"]
        : ["I'm okay", "Not feeling well", "I need help"];
      useIrisStore.getState().setPredictions(fallback);
      useIrisStore.getState().setIsContextResponse(true);
      return;
    }

    useIrisStore.getState().setIsPredicting(true);

    try {
      let predictions: string[];

      if (isYesNo) {
        // For Yes/No questions: slots 1 & 2 are fixed. Only ask LLM for slot 3 if no env keyword.
        let third = envButton;
        if (!third) {
          const reply = await this.enqueue(() => this.engine!.chat.completions.create({
            messages: [
              { role: "system", content: "You are an AAC assistant. Output ONLY a single short phrase (2-5 words) a patient can say. No quotes, no punctuation at end." },
              { role: "user", content: `Doctor asks: "${ambientContext}". Give one short natural patient reply that is NOT simply Yes or No.` }
            ],
            max_tokens: 20,
            temperature: 0.7,
          }));
          third = reply.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, "") || "A little bit";
        }
        predictions = ["Yes", "No", third];

      } else {
        // Open question: ask LLM for 3 natural replies, but give it a very simple task
        const reply = await this.enqueue(() => this.engine!.chat.completions.create({
          messages: [
            { role: "system", content: "You are an AAC assistant. Output ONLY a JSON array of 3 short patient replies (each 2-5 words). Example: [\"I'm okay\",\"Not great\",\"I'm in pain\"]" },
            { role: "user", content: `Doctor says: "${ambientContext}"` }
          ],
          max_tokens: 60,
          temperature: 0.7,
        }));

        let content = reply.choices[0]?.message?.content || "";
        content = content.replace(/```json/g, "").replace(/```/g, "").trim();
        console.log("[WebLLM] Open-question prediction:", content);

        try {
          const parsed = JSON.parse(content);
          predictions = Array.isArray(parsed) && parsed.length >= 3
            ? parsed.slice(0, 3).map(String)
            : ["I'm okay", "Not feeling well", "I need help"];
        } catch {
          // Even if JSON fails, try to pull out any quoted strings
          const matches = content.match(/"([^"]+)"/g)?.map((s: string) => s.replace(/"/g, ""));
          predictions = matches && matches.length >= 3
            ? matches.slice(0, 3)
            : ["I'm okay", "Not feeling well", "I need help"];
        }
      }

      useIrisStore.getState().setPredictions(predictions);
      useIrisStore.getState().setIsContextResponse(true);
    } catch (error) {
      console.error("Local LLM Context Prediction error:", error);
      const fallback = isYesNo
        ? ["Yes", "No", envButton ?? "I'm not sure"]
        : ["I'm okay", "Not feeling well", "I need help"];
      useIrisStore.getState().setPredictions(fallback);
      useIrisStore.getState().setIsContextResponse(true);
    } finally {
      useIrisStore.getState().setIsPredicting(false);
    }
  }

  async evaluatePatientIntentForHardware(patientText: string, context?: string): Promise<void> {
    if (!this.engine || !this.isLoaded || !patientText) return;

    // We use a strict prompt to identify if the spoken text implies an environmental command
    const systemMessage = "You are a logical intent parser.";
    const userMessage = `The doctor said: "${context || 'nothing'}"
The patient replied: "${patientText}"

RULES:
1. If the conversation has NOTHING to do with temperature (hot/cold) or lighting (dark/bright), you must output [NONE].
2. If the patient explicitly asks or implies they want the fan ON, output [ACTION: {"device": "fan", "state": "ON"}]
3. If the patient explicitly asks or implies they want the fan OFF, output [ACTION: {"device": "fan", "state": "OFF"}]
4. If the patient explicitly asks or implies they want the light ON, output [ACTION: {"device": "light", "state": "ON"}]
5. If the patient explicitly asks or implies they want the light OFF, output [ACTION: {"device": "light", "state": "OFF"}]

EXAMPLES:
Doctor: "Are you hungry?" / Patient: "Yes" -> [NONE]
Doctor: "Are you feeling hot?" / Patient: "Yes" -> [ACTION: {"device": "fan", "state": "ON"}]
Doctor: "Are you feeling cold?" / Patient: "Yes" -> [ACTION: {"device": "fan", "state": "OFF"}]

CRITICAL: Output NOTHING else. No explanations. Just the tag.`;

    try {
      const reply = await this.enqueue(() => this.engine!.chat.completions.create({
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage }
        ],
        max_tokens: 100, // increased to avoid truncation
        temperature: 0.1, // low temperature for strict evaluation
      }));

      const content = reply.choices[0]?.message?.content || "";
      console.log("[WebLLM] Raw Hardware Eval Output:", content);
      
      const actionMatch = content.match(/\[ACTION:\s*(\{[\s\S]*?\})\s*\]/);
      
      if (actionMatch) {
        try {
          const args = JSON.parse(actionMatch[1]);
          console.log("[WebLLM] Hardware Action Triggered by Patient:", args);
          // Fire API asynchronously
          fetch("/api/room-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device: args.device, state: String(args.state).toUpperCase() })
          }).catch(err => console.error("Hardware API error:", err));
        } catch (e) {
          console.error("Failed to parse hardware intent JSON:", actionMatch[1]);
        }
      }
    } catch (error) {
      console.error("Local LLM Hardware Eval error:", error);
    }
  }

  async filterNodesByContext(ambientContext: string, availableNodes: string[]): Promise<void> {
    if (!this.engine || !this.isLoaded || !ambientContext || availableNodes.length === 0) return;

    const systemMessage = `You are a logical filtering engine for an AAC interface. The user is a non-verbal patient. The caregiver has just spoken: '${ambientContext}'. 
Your task is to identify which of the following pre-defined concepts are logically relevant or useful for the patient to respond with. 
Available concepts: [${availableNodes.join(", ")}]. 
Output ONLY a comma-separated list of the relevant concepts from the available list. If none are relevant, output nothing. Do not use quotes, explanation, or conversational filler.`;
    const userMessage = "Output the relevant concepts.";

    try {
      const reply = await this.enqueue(() => this.engine!.chat.completions.create({
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage }
        ],
        max_tokens: 50,
      }));

      const content = reply.choices[0]?.message?.content || "";
      const parsedArray = content.split(",")
        .map(w => w.trim())
        .filter(w => availableNodes.includes(w));
      
      if (parsedArray.length > 0) {
        useIrisStore.getState().setActiveContextNodeIds(parsedArray);
      } else {
        useIrisStore.getState().setActiveContextNodeIds(null);
      }
    } catch (error) {
      console.error("Local LLM Context Filtering error:", error);
      useIrisStore.getState().setActiveContextNodeIds(null);
    }
  }
}

const globalForWebLlm = globalThis as unknown as {
  webLlmService: WebLlmService | undefined;
};

export const webLlmService = globalForWebLlm.webLlmService ?? new WebLlmService();

if (process.env.NODE_ENV !== "production") {
  globalForWebLlm.webLlmService = webLlmService;
}
