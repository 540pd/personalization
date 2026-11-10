"use client";

// One Create node on the board (#468, moved out of NodePanel): its
// placeholder, the chrome around it (NodeChrome), and its Generate panel or
// in-place editor. The draft is useNodeDraft; where it sits is nodeScreenBox.

import { useState, useMemo, useCallback, useRef } from "react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { selectOnly } from "@/lib/canvas/selection";
import type { Viewport } from "@/lib/canvas/coords";
import { useLayerOrder } from "@/store/layerOrder.store";
import { useSection } from "@/store/section.store";
import { useSkills } from "@/store/skills.store";
import { useAgents } from "@/store/agents.store";
import { useCanvasArea } from "../../canvasArea";
import GenerateForm from "./GenerateForm";
import { kindSpec, panelOutput } from "./kinds";
import { panelPlacement } from "./panelPlacement";
import { nodeScreenBox } from "./nodeScreenBox";
import { useNodeDraft } from "./hooks/useNodeDraft";
import { usePanelDrag } from "./hooks/usePanelDrag";
import { usePanelResize } from "./hooks/usePanelResize";
import { useGeneration } from "./hooks/useGeneration";
import NodeChrome from "./NodeChrome";
import Placeholder from "./Placeholder";
import ComposeEditor from "./ComposeEditor";
import ComposeOutputLayer from "./ComposeOutputLayer";

export interface SinglePanelProps {
  instance:       PanelInstance;
  isActive:       boolean; // selected (transformer border)
  isPanelOpen:    boolean; // selected, with its panel open
  vp:             Viewport;
  onActivate:     () => void; // inactive → active
  onOpenPanel:    () => void; // active → panel-open
  onClosePanel:   () => void; // panel-open → active (X button)
  onSetCanvasPos: (x: number, y: number) => void;
  hideInputPort:  boolean;
  hideOutputPort: boolean;
  hideLabel:      boolean;
}

export default function SinglePanel({
  instance, isActive, isPanelOpen, vp,
  onActivate, onOpenPanel, onClosePanel, onSetCanvasPos,
  hideInputPort, hideOutputPort, hideLabel,
}: SinglePanelProps) {
  const { scale } = vp;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  // The kind's spec is the only thing that differs between node types.
  const spec = kindSpec(instance.kind);
  const { draft, settings, setSettings, setDraft, commitInstruction } = useNodeDraft(instance, spec);

  const { busy, waiting, busyLabel, error, notice, upstreamError, generate } = useGeneration(instance, spec, draft, settings);
  const { dragging, handlers } = usePanelDrag({
    instance, isActive, isPanelOpen, scale, authored: !!spec.authored, onActivate, onOpenPanel, onClosePanel, onSetCanvasPos,
  });
  const anchorHandlers = usePanelResize(instance, scale, onSetCanvasPos);

  const [hovered,     setHovered]     = useState(false);
  // An authored kind's in-place editor (#181). Local: only one node is
  // edited at a time, and closing it is what saves the name.
  const [editing,     setEditing]     = useState(false);

  // Size comes from the store so undo can restore it atomically with position.
  // pw/ph are canvas units; box is the node on screen at the current zoom.
  const pw = instance.w;
  const ph = instance.h;
  const box = nodeScreenBox(instance, vp);

  // The panel is placed relative to the node, so it has to know how much room
  // is left on screen. The visible canvas, not the window: the left-flip
  // fallback would otherwise push a panel underneath the sidebar.
  const area = useCanvasArea();
  const viewLeft = area.left ?? 0;
  const panelLeft = panelPlacement({
    nodeLeft: box.left, nodeWidth: box.width, viewLeft, viewRight: viewLeft + area.width,
  });

  // What @ can name in the Instruction (#239).
  const skills = useSkills((s) => s.skills);
  const agents = useAgents((s) => s.agents);
  const mentionables = useMemo(() => ({ skills, agents }), [skills, agents]);

  // What the box shows: a written kind shows its text; others their output.
  const shown = spec.authored ? panelOutput(instance) : instance.output;
  // A link in an unselected Compose box selects the box instead of following.
  const handleComposeLinkClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isActive) return;
    event.preventDefault();
    selectOnly("panel");
    useNodePanel.getState().raisePanel(instance.id);
    useLayerOrder.getState().raiseDom();
    onActivateRef.current();
  }, [instance.id, isActive]);

  return (
    <>
      <NodeChrome
        instance={instance}
        box={box}
        vp={vp}
        hovered={hovered}
        isActive={isActive}
        isPanelOpen={isPanelOpen}
        anchors={anchorHandlers}
        hideLabel={hideLabel}
        hideInputPort={hideInputPort}
        hideOutputPort={hideOutputPort}
      />

      <Placeholder
        spec={spec}
        shown={shown}
        busy={busy}
        waiting={waiting}
        upstreamError={upstreamError}
        dragging={dragging}
        isPanelOpen={isPanelOpen}
        left={box.left}
        top={box.top}
        width={pw}
        height={ph}
        scale={scale}
        handlers={handlers}
        onDoubleClick={() => { if (spec.authored) setEditing(true); }}
        onHoverChange={setHovered}
      />

      {shown && spec.authored && (
        <ComposeOutputLayer
          spec={spec}
          value={shown.value}
          left={box.left}
          top={box.top}
          width={pw}
          height={ph}
          scale={scale}
          handlers={handlers}
          onDoubleClick={() => setEditing(true)}
          onHoverChange={setHovered}
          onLinkClick={handleComposeLinkClick}
        />
      )}

      {/* ── In-place editor — an authored kind's double-click (#181) ── */}
      {editing && (
        <ComposeEditor
          instance={instance}
          spec={spec}
          draft={draft}
          settings={settings}
          left={box.left}
          top={box.top}
          width={pw}
          height={ph}
          scale={scale}
          onClose={() => setEditing(false)}
        />
      )}

      {/* ── Generation panel ── */}
      {isPanelOpen && !spec.authored && (
        <GenerateForm
          spec={spec}
          draft={draft}
          onDraftChange={setDraft}
          settings={settings}
          onSettingsChange={setSettings}
          busy={busy}
          busyLabel={busyLabel}
          error={error}
          notice={notice}
          left={panelLeft}
          top={box.centreY}
          onClose={onClosePanel}
          onInstructionBlur={commitInstruction}
          onSubmit={generate}
          mentionables={mentionables}
          onOpenLibrary={(section) => useSection.getState().setSection(section)}
        />
      )}
    </>
  );
}
