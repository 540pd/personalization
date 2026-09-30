"use client";

// Luma reference: TOOL-01 — Floating creation and annotation dock.
// Fixed at bottom-center of the board. Contains tool icon buttons.
// No generation behaviour yet — clicking activates the visual state only.

type Tool = {
  id: string;
  label: string;
  icon: string;
};

const TOOLS: Tool[] = [
  { id: "select", label: "Select", icon: "↖" },
  { id: "image", label: "Image", icon: "🖼" },
  { id: "video", label: "Video", icon: "▶" },
  { id: "audio", label: "Audio", icon: "♪" },
  { id: "text", label: "Text", icon: "T" },
  { id: "shapes", label: "Shapes", icon: "◻" },
];

interface FloatingDockProps {
  activeTool?: string;
  onToolSelect?: (toolId: string) => void;
}

export default function FloatingDock({ activeTool, onToolSelect }: FloatingDockProps) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-1 rounded-full bg-neutral-900 border border-neutral-700 shadow-xl px-3 py-2">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            title={tool.label}
            onClick={() => onToolSelect?.(tool.id)}
            className={[
              "w-9 h-9 flex items-center justify-center rounded-full text-sm transition-colors",
              activeTool === tool.id
                ? "bg-white text-neutral-900"
                : "text-neutral-300 hover:bg-neutral-700 hover:text-white",
            ].join(" ")}
          >
            {tool.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
