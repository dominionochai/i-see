import { create } from 'zustand';
import { ttsService } from "@/utils/ttsService";
import { webLlmService } from "@/utils/webLlmService";

interface IrisState {
  appStage: 'landing' | 'calibrating' | 'project';
  setAppStage: (stage: 'landing' | 'calibrating' | 'project') => void;
  cursor: { x: number; y: number };
  selectedNodes: string[];
  predictions: string[];
  isPredicting: boolean;
  showMediaModal: boolean;
  showEnvironmentModal: boolean;
  sleepMode: boolean;
  blockFrequencies: Record<string, number>;
  coreBlocks: string[];
  showEyeMirror: boolean;
  toggleEyeMirror: () => void;
  activeTone: string | null;
  ambientContext: string;
  isListening: boolean;
  isTranscribing: boolean;
  sttDownloadProgress: number;
  sttReady: boolean;
  liveCaption: string; // legacy, used for fallback
  sttError: string | null;
  llmStatus: string;
  llmReady: boolean;
  hoveredNodeId: string | null;
  dwellProgress: number;
  lastTriggeredNodeId: string | null;
  generatedSpeech: string | null;
  isDebugMode: boolean;
  activeContextNodeIds: string[] | null;
  isContextResponse: boolean;
  isAppSpeaking: boolean;
  isCalibrated: boolean;
  calibrationBounds: { xMin: number; xMax: number; yMin: number; yMax: number } | null;
  currentCalibrationStep: number;
  rawCursor: { x: number; y: number };
  driftOffset: { x: number; y: number };
  requestRecenter: boolean;
  magneticLockCenter: { x: number; y: number } | null;
  setCursor: (x: number, y: number) => void;
  setRawCursor: (x: number, y: number) => void;
  setMagneticLockCenter: (coords: { x: number; y: number } | null) => void;
  setCalibrationBounds: (bounds: { xMin: number; xMax: number; yMin: number; yMax: number } | null) => void;
  setCalibrationStep: (step: number) => void;
  resetCalibration: () => void;
  setDriftOffset: (offset: { x: number; y: number }) => void;
  triggerRecenter: () => void;
  clearRecenterRequest: () => void;
  addNode: (node: string) => void;
  clearNodes: () => void;
  setPredictions: (words: string[]) => void;
  setIsPredicting: (status: boolean) => void;
  setShowMediaModal: (val: boolean) => void;
  setShowEnvironmentModal: (val: boolean) => void;
  setSleepMode: (val: boolean) => void;
  incrementFrequency: (node: string) => void;
  reoptimizeLayout: () => void;
  setActiveTone: (tone: string | null) => void;
  setAmbientContext: (context: string) => void;
  setIsListening: (status: boolean) => void;
  setIsTranscribing: (status: boolean) => void;
  setSttDownloadProgress: (progress: number) => void;
  setSttReady: (status: boolean) => void;
  setLiveCaption: (caption: string) => void;
  setSttError: (error: string | null) => void;
  setLlmStatus: (status: string) => void;
  setLlmReady: (ready: boolean) => void;
  setHoveredNodeId: (id: string | null) => void;
  setDwellProgress: (progress: number) => void;
  setLastTriggeredNodeId: (id: string | null) => void;
  toggleDebugMode: () => void;
  setGeneratedSpeech: (s: string | null) => void;
  setActiveContextNodeIds: (ids: string[] | null) => void;
  setIsContextResponse: (val: boolean) => void;
  setIsAppSpeaking: (val: boolean) => void;
  executeAction: (targetId: string, targetElement?: Element) => void;
  wasContextResponse: boolean;
}

const defaultBlocks = ["Hungry", "Yes", "No", "Environment", "Toilet", "Social", "Pain", "Thirsty"];

export const useIrisStore = create<IrisState>((set) => ({
  appStage: 'landing',
  setAppStage: (stage) => set({ appStage: stage }),
  cursor: { x: 0, y: 0 },
  selectedNodes: [],
  predictions: [],
  isPredicting: false,
  showMediaModal: false,
  showEnvironmentModal: false,
  setShowEnvironmentModal: (val) => set({ showEnvironmentModal: val }),
  sleepMode: false,
  blockFrequencies: {},
  coreBlocks: [...defaultBlocks],
  showEyeMirror: false,
  toggleEyeMirror: () => set((state) => ({ showEyeMirror: !state.showEyeMirror })),
  activeTone: null,
  ambientContext: "",
  isListening: false,
  isTranscribing: false,
  sttDownloadProgress: 0,
  sttReady: false,
  liveCaption: "",
  sttError: null,
  llmStatus: "Loading Model…",
  llmReady: false,
  hoveredNodeId: null,
  dwellProgress: 0,
  lastTriggeredNodeId: null,
  generatedSpeech: null,
  isDebugMode: true,
  activeContextNodeIds: null,
  isContextResponse: false,
  wasContextResponse: false,
  isAppSpeaking: false,
  isCalibrated: false,
  calibrationBounds: null,
  currentCalibrationStep: -1,
  rawCursor: { x: 0, y: 0 },
  driftOffset: { x: 0, y: 0 },
  requestRecenter: false,
  magneticLockCenter: null,
  setCursor: (x, y) => set({ cursor: { x, y } }),
  setRawCursor: (x, y) => set({ rawCursor: { x, y } }),
  setMagneticLockCenter: (coords) => set({ magneticLockCenter: coords }),
  setCalibrationBounds: (bounds) => set({ calibrationBounds: bounds, isCalibrated: bounds !== null }),
  setCalibrationStep: (step) => set({ currentCalibrationStep: step }),
  resetCalibration: () => set({ isCalibrated: false, calibrationBounds: null, currentCalibrationStep: -1, driftOffset: { x: 0, y: 0 } }),
  setDriftOffset: (offset) => set({ driftOffset: offset }),
  triggerRecenter: () => set({ requestRecenter: true }),
  clearRecenterRequest: () => set({ requestRecenter: false }),
  addNode: (node) => set((state) => {
    if (state.generatedSpeech) {
      return { selectedNodes: [node], generatedSpeech: null, activeContextNodeIds: null, isContextResponse: false, wasContextResponse: state.isContextResponse || state.wasContextResponse };
    }
    return { selectedNodes: [...state.selectedNodes, node], activeContextNodeIds: null, isContextResponse: false, wasContextResponse: state.isContextResponse || state.wasContextResponse };
  }),
  clearNodes: () => set({ selectedNodes: [], predictions: [], activeContextNodeIds: null, isContextResponse: false, generatedSpeech: null, wasContextResponse: false }),
  setPredictions: (words) => set({ predictions: words }),
  setIsPredicting: (status) => set({ isPredicting: status }),
  setShowMediaModal: (val) => set({ showMediaModal: val }),
  setSleepMode: (val) => set({ sleepMode: val }),
  incrementFrequency: (node) => set((state) => {
    const newFreqs = { ...state.blockFrequencies };
    newFreqs[node] = (newFreqs[node] || 0) + 1;
    return { blockFrequencies: newFreqs };
  }),
  reoptimizeLayout: () => set((state) => {
    // Sort blocks based on frequency (highest first)
    const sorted = [...state.coreBlocks].sort((a, b) => {
      const freqA = state.blockFrequencies[a] || 0;
      const freqB = state.blockFrequencies[b] || 0;
      return freqB - freqA; // descending
    });
    // In a 4x4 grid (or similar), indices that are closest to center are roughly in the middle of the array.
    // For simplicity, we define an optimal center-out index mapping for an array of 13 items.
    // Optimal visual indices for 4 columns: center blocks are 5, 6, 9, 10
    const optimalIndices = [5, 6, 9, 10, 4, 7, 8, 11, 1, 2, 0];
    const newGrid = new Array(sorted.length);
    sorted.forEach((block, i) => {
      const targetIndex = optimalIndices[i] !== undefined ? optimalIndices[i] : i;
      newGrid[targetIndex] = block;
    });
    return { coreBlocks: newGrid };
  }),
  setActiveTone: (tone) => set({ activeTone: tone }),
  setAmbientContext: (context) => set({ ambientContext: context }),
  setIsListening: (status) => set({ isListening: status }),
  setIsTranscribing: (status) => set({ isTranscribing: status }),
  setSttDownloadProgress: (progress) => set({ sttDownloadProgress: progress }),
  setSttReady: (status) => set({ sttReady: status }),
  setLiveCaption: (caption) => set({ liveCaption: caption }),
  setSttError: (error) => set({ sttError: error }),
  setLlmStatus: (status) => set({ llmStatus: status }),
  setLlmReady: (ready) => set({ llmReady: ready }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  setDwellProgress: (progress) => set({ dwellProgress: progress }),
  setLastTriggeredNodeId: (id) => set({ lastTriggeredNodeId: id }),
  toggleDebugMode: () => set((state) => ({ isDebugMode: !state.isDebugMode })),
  setGeneratedSpeech: (s) => set({ generatedSpeech: s }),
  setActiveContextNodeIds: (ids) => set({ activeContextNodeIds: ids }),
  setIsContextResponse: (val) => set({ isContextResponse: val }),
  setIsAppSpeaking: (val) => set({ isAppSpeaking: val }),
  executeAction: (targetId, targetElement) => set((state) => {
    if (targetId === "speak-block") {
      if (targetElement) {
        targetElement.dispatchEvent(new CustomEvent('dwell-click'));
      }
    } else if (targetId === "clear-block") {
      return { 
        selectedNodes: [], predictions: [], activeContextNodeIds: null, 
        isContextResponse: false, generatedSpeech: null,
        ambientContext: "", liveCaption: ""
      };
    } else if (targetId === "wake-block") {
      return { sleepMode: false };
    } else if (targetId === "close-modal") {
      return { showMediaModal: false };
    } else if (targetId === "close-env-modal") {
      return { showEnvironmentModal: false };
    } else if (targetId.startsWith("tone-block-")) {
      const tone = targetId.replace("tone-block-", "");
      return { activeTone: state.activeTone === tone ? null : tone };
    } else {
      let nodeVal = targetId.replace("grid-block-", "");
      if (targetElement && targetElement.hasAttribute("data-block-id")) {
        nodeVal = targetElement.getAttribute("data-block-id")!;
      }

      if (nodeVal === "EMERGENCY") {
        ttsService.speak("Emergency triggered");
        fetch("https://api.twilio.com/2010-04-01/Accounts/AC_mock/Messages.json", { method: "POST" }).catch(() => {});
        return {};
      } else if (state.isContextResponse && targetId.startsWith("pred-")) {
        const doctorContext = state.ambientContext; // capture BEFORE clearing
        const lowerVal = nodeVal.toLowerCase();
        const lowerCtx = doctorContext.toLowerCase();

        let device: string | null = null;
        let hwState: string | null = null;

        if (lowerVal.includes("turn on the fan") || (lowerVal === "yes" && (lowerCtx.includes("hot") || lowerCtx.includes("warm")))) {
          device = "fan"; hwState = "ON";
        } else if (lowerVal.includes("turn off the fan") || (lowerVal === "yes" && lowerCtx.includes("cold"))) {
          device = "fan"; hwState = "OFF";
        } else if (lowerVal.includes("turn on the light") || lowerVal.includes("turn on the lamp") || (lowerVal === "yes" && lowerCtx.includes("dark"))) {
          device = "light"; hwState = "ON";
        } else if (lowerVal.includes("turn off the light") || lowerVal.includes("turn off the lamp") || (lowerVal === "yes" && (lowerCtx.includes("bright") || lowerCtx.includes("too light")))) {
          device = "light"; hwState = "OFF";
        }

        if (device && hwState) {
          console.log(`[Store] Hardware trigger: ${device} -> ${hwState} (ctx="${doctorContext}", val="${nodeVal}")`);
          fetch("/api/room-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device, state: hwState }),
          }).catch(err => console.error("Hardware API error:", err));
        }

        ttsService.speak(nodeVal);
        return { 
          isContextResponse: false, predictions: [], ambientContext: "", 
          generatedSpeech: nodeVal, liveCaption: "" 
        };
      } else if (nodeVal === "Sleep Mode") {
        return { sleepMode: true };
      } else if (nodeVal === "Re-Optimize Layout") {
        // Run reoptimize inside state update
        const sorted = [...state.coreBlocks].sort((a, b) => {
          const freqA = state.blockFrequencies[a] || 0;
          const freqB = state.blockFrequencies[b] || 0;
          return freqB - freqA;
        });
        const optimalIndices = [5, 6, 9, 10, 4, 7, 8, 11, 1, 2, 0];
        const newGrid = new Array(sorted.length);
        sorted.forEach((block, i) => {
          const tIndex = optimalIndices[i] !== undefined ? optimalIndices[i] : i;
          newGrid[tIndex] = block;
        });
        return { coreBlocks: newGrid };
      } else if (nodeVal === "Music" && state.selectedNodes.includes("Entertainment")) {
        return { showMediaModal: true, selectedNodes: [], predictions: [], activeContextNodeIds: null, isContextResponse: false };
      } else if (nodeVal === "Environment") {
        return { showEnvironmentModal: true, selectedNodes: [], predictions: [], activeContextNodeIds: null, isContextResponse: false };
      } else {
        const newNodes = [...state.selectedNodes, nodeVal];
        const newFreqs = { ...state.blockFrequencies };
        newFreqs[nodeVal] = (newFreqs[nodeVal] || 0) + 1;
        
        // Fire prediction background task
        webLlmService.predictNextWords(newNodes);
        
        return { 
          selectedNodes: newNodes, 
          blockFrequencies: newFreqs,
          activeContextNodeIds: null, 
          isContextResponse: false,
          generatedSpeech: null
        };
      }
    }
    return {};
  }),
}));
