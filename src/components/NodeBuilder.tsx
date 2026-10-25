"use client";
import { useIrisStore } from "@/store/useIrisStore";

const CHIP_COLORS = [
  { bg: "#E63946", text: "#fff" }, // red
  { bg: "#2D7DFF", text: "#fff" }, // blue
  { bg: "#1FB57A", text: "#fff" }, // green
  { bg: "#FF8A3D", text: "#fff" }, // orange
  { bg: "#7B5CFF", text: "#fff" }, // purple
];

export function NodeBuilder() {
  const { selectedNodes, clearNodes, isContextResponse } = useIrisStore();
  const isClearDisabled = selectedNodes.length === 0 && !isContextResponse;

  return (
    <div className="w-full h-[10vh] shrink-0 px-6 py-3 flex items-center justify-between z-10 relative bg-[#FFE3EC] border-b-2 border-black/10 shadow-sm">
      {/* Selected node chips */}
      <div className="flex gap-3 flex-wrap overflow-y-auto h-full items-center flex-1 mr-4 pr-2">
        {selectedNodes.map((node, i) => {
          const color = CHIP_COLORS[i % CHIP_COLORS.length];
          return (
            <span
              key={i}
              className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-[var(--ink)] shadow-[0_2px_0_var(--ink)]"
              style={{
                backgroundColor: color.bg,
                color: color.text,
                animation: `iris-scale-in 0.2s ease-out ${i * 0.05}s both`
              }}
            >
              {node}
            </span>
          );
        })}
        {selectedNodes.length === 0 && (
          <span className="text-black/40 font-bold text-sm tracking-wide">
            Select symbols to build a sentence…
          </span>
        )}
      </div>

      {/* Clear button */}
      <button
        id="clear-block"
        onClick={clearNodes}
        data-disabled={isClearDisabled || undefined}
        className={`px-6 py-2.5 rounded-xl font-bold tracking-wide border-2 transition-all shrink-0 ${
          isClearDisabled
            ? "text-black/30 border-black/10 bg-black/5 opacity-50 cursor-default"
            : "text-[var(--ink)] border-[var(--ink)] bg-white shadow-[0_4px_0_var(--ink)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_0px_0_var(--ink)] cursor-pointer"
        }`}
      >
        Clear
      </button>
    </div>
  );
}
