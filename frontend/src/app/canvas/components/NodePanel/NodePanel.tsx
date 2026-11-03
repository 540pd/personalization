"use client";

// Luma reference: IMG-02/03 — Create Image panel.
// Each Node → Image click creates an independent placeholder + panel instance.
// Instances are stored in the nodePanelStore array and rendered here, one
// SinglePanel each (#468). Undo, Delete and Escape are usePanelCommands.

import { useNodePanel } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useLayerOrder } from "@/store/layerOrder.store";
import { chromeCovered } from "./chromeCovered";
import { usePanelCommands } from "./hooks/usePanelCommands";
import SinglePanel from "./SinglePanel";
import "./NodePanel.scss";

export default function NodePanel() {
  const { panels, selectedIds, openId, select, openPanel, closePanel, setCanvasPos } = useNodePanel();
  const selected = new Set(selectedIds);
  const { x, y, scale } = useViewport();
  const vp = { x, y, scale };
  const topLayer = useLayerOrder((s) => s.topLayer);
  const konvaNodes = Object.values(useKonvaNodes((s) => s.nodes));
  usePanelCommands();

  return (
    <>
      {panels.map((p, i) => {
        const covered = chromeCovered(p, panels.slice(i + 1), konvaNodes, topLayer, scale);
        return (
          <SinglePanel
            key={p.id}
            instance={p}
            isActive={selected.has(p.id)}
            isPanelOpen={openId === p.id}
            vp={vp}
            onActivate={()         => select(p.id)}
            onOpenPanel={()        => openPanel(p.id)}
            onClosePanel={()       => closePanel(p.id)}
            onSetCanvasPos={(x, y) => setCanvasPos(p.id, x, y)}
            hideInputPort={covered.input}
            hideOutputPort={covered.output}
            hideLabel={covered.label}
          />
        );
      })}
    </>
  );
}
