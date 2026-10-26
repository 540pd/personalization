"use client";

// Luma reference: IMG-02/03 — Create Image panel.
// Each Node → Image click creates an independent placeholder + panel instance.
// Instances are stored in the nodePanelStore array and rendered here.

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useViewport } from "@/store/viewport.store";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { LABEL_GAP, LABEL_MIN_NODE_W } from "@/constants/canvas.constants";
import { canvasHistory } from "@/lib/canvas/history";
import { selectOnly } from "@/lib/canvas/selection";
import { useLayerOrder } from "@/store/layerOrder.store";
import { useSection } from "@/store/section.store";
import { boardKeyAllowed } from "@/lib/canvas/boardKeys";
import { useSkills } from "@/store/skills.store";
import { useAgents } from "@/store/agents.store";
import { useSettings } from "@/store/settings.store";
import { useHoveredNode } from "@/store/hover.store";
import { labelFromInstruction, takenLabels, uniqueLabel } from "@/lib/canvas/labels";
import { useCanvasArea } from "../../canvasArea";
import NodeLabel from "../NodeLabel";
import GenerateForm, { type GenerateDraft } from "./GenerateForm";
import { kindSpec, panelOutput } from "./kinds";
import { chromeCovered } from "./chromeCovered";
import { panelPlacement } from "./panelPlacement";
import { useNodeSettings } from "./hooks/useNodeSettings";
import { usePanelDrag } from "./hooks/usePanelDrag";
import { usePanelResize } from "./hooks/usePanelResize";
import { useGeneration } from "./hooks/useGeneration";
import HoverOutline from "./HoverOutline";
import SelectionBox from "./SelectionBox";
import NodePorts from "./NodePorts";
import Placeholder from "./Placeholder";
import ComposeEditor from "./ComposeEditor";
import ComposeOutputLayer from "./ComposeOutputLayer";
import "./NodePanel.scss";

// ── Per-instance component ────────────────────────────────────────────────────

interface SinglePanelProps {
  instance:       PanelInstance;
  stageX:         number;
  stageY:         number;
  scale:          number;
  onActivate:     () => void; // inactive → active
  onOpenPanel:    () => void; // active → panel-open
  onClosePanel:   () => void; // panel-open → active (X button)
  onRemove:       () => void;
  onSetCanvasPos: (x: number, y: number) => void;
  hideInputPort:  boolean;
  hideOutputPort: boolean;
  hideLabel:      boolean;
}

function SinglePanel({
  instance, stageX, stageY, scale,
  onActivate, onOpenPanel, onClosePanel, onSetCanvasPos,
  hideInputPort, hideOutputPort, hideLabel,
}: SinglePanelProps) {
  const { canvasX, canvasY, isActive, isPanelOpen } = instance;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  // The kind's spec is the only thing that differs between node types.
  const spec = kindSpec(instance.kind);
  // The draft lives in the store, not in GenerateForm: the form unmounts
  // whenever the panel collapses, a half-written prompt must survive that,
  // and a copy of the node carries it. In-flight state stays local.
  const draft: GenerateDraft = instance.draft ?? {
    model: spec.defaultModel ?? spec.models[0]?.id ?? "",
    instruction: "",
  };
  const { settings, setSettings } = useNodeSettings(instance, spec, draft);
  const setDraft = (next: GenerateDraft) =>
    useNodePanel.getState().setDraft(instance.id, { model: next.model, instruction: next.instruction, settings });

  const { busy, waiting, busyLabel, error, upstreamError, generate } = useGeneration(instance, spec, draft, settings);
  const { dragging, handlers } = usePanelDrag({
    instance, scale, authored: !!spec.authored, onActivate, onOpenPanel, onClosePanel, onSetCanvasPos,
  });
  const anchorHandlers = usePanelResize(instance, scale, onSetCanvasPos);

  const [hovered,     setHovered]     = useState(false);
  // Names off (#215): this node's name shows only while hovered or selected.
  // The board-wide hover, not `hovered`: that one ends at the placeholder,
  // and the pointer has to be able to travel up onto the name.
  const alwaysNames = useSettings((s) => s.settings.showNodeNames);
  const hoveredNodeId = useHoveredNode(!alwaysNames);
  // An authored kind's in-place editor (#181). Local: only one node is
  // edited at a time, and closing it is what saves the name.
  const [editing,     setEditing]     = useState(false);

  // The panel is placed relative to the node, so it has to know how much room
  // is left on screen. The visible canvas, not the window: the left-flip
  // fallback would otherwise push a panel underneath the sidebar.
  const area = useCanvasArea();
  const viewLeft = area.left ?? 0;

  // pw/ph are canvas units; sw/sh are their on-screen size at the current zoom.
  // Node geometry uses sw/sh; chrome (ports, anchors, panel) keeps a fixed pixel size.
  // Size comes from the store so undo can restore it atomically with position.
  const pw = instance.w;
  const ph = instance.h;
  const sw = pw * scale;
  const sh = ph * scale;

  const screenLeft    = stageX + canvasX * scale;
  const screenCenterY = stageY + canvasY * scale;
  const placeholderLeft = screenLeft;
  const placeholderTop  = screenCenterY - sh / 2;
  const panelLeft = panelPlacement({
    nodeLeft: screenLeft, nodeWidth: sw, viewLeft, viewRight: viewLeft + area.width,
  });

  // What @ can name in the Instruction (#239).
  const skills = useSkills((s) => s.skills);
  const agents = useAgents((s) => s.agents);
  const mentionables = useMemo(() => ({ skills, agents }), [skills, agents]);

  // Seed the name as soon as there is an instruction rather than waiting for
  // a result — a node needs identifying while you are still configuring it.
  const handleInstructionBlur = () => {
    const instruction = draft.instruction;
    useNodePanel.getState().setDraft(instance.id, {
      model: draft.model,
      instruction,
      settings,
    });
    if (instance.label || !instruction.trim()) return;
    useNodePanel.getState().setLabel(
      instance.id,
      uniqueLabel(labelFromInstruction(instruction), takenLabels()),
      true
    );
  };

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
      {/* Suppressed while active, since the selection box below already draws a border. */}
      {hovered && !isActive && (
        <HoverOutline left={placeholderLeft} top={placeholderTop} width={sw} height={sh} />
      )}

      {/* ── Transformer border + corner anchors — only in active/panel-open states ── */}
      {isActive && (
        <SelectionBox
          left={placeholderLeft}
          top={placeholderTop}
          width={sw}
          height={sh}
          anchors={isPanelOpen ? undefined : anchorHandlers}
        />
      )}

      {/* ── Name — always on, same rules as uploaded images. Hidden when
           covered, except while selected: selecting a buried node and
           getting no name back would defeat the point. ── */}
      {instance.label && sw >= LABEL_MIN_NODE_W && (!hideLabel || isActive) && (
        <NodeLabel
          value={instance.label}
          left={placeholderLeft}
          bottom={placeholderTop - LABEL_GAP}
          maxWidth={sw}
          // An unchanged commit (open, then click away) is not a rename, and
          // must not turn an auto name into a user-chosen one.
          onCommit={(next) => {
            if (next !== instance.label) useNodePanel.getState().setLabel(instance.id, next);
          }}
          hidden={!alwaysNames && !isActive && hoveredNodeId !== instance.id}
        />
      )}

      {/* ── Ports — visible unless another panel covers them ── */}
      <NodePorts
        instance={instance}
        vp={{ x: stageX, y: stageY, scale }}
        showInput={spec.acceptsInput !== false && !hideInputPort}
        showOutput={spec.isSource !== false && !hideOutputPort}
      />

      <Placeholder
        spec={spec}
        shown={shown}
        busy={busy}
        waiting={waiting}
        upstreamError={upstreamError}
        dragging={dragging}
        isPanelOpen={isPanelOpen}
        left={placeholderLeft}
        top={placeholderTop}
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
          left={placeholderLeft}
          top={placeholderTop}
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
          left={placeholderLeft}
          top={placeholderTop}
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
          left={panelLeft}
          top={screenCenterY}
          onClose={onClosePanel}
          onInstructionBlur={handleInstructionBlur}
          onSubmit={generate}
          mentionables={mentionables}
          onOpenLibrary={(section) => useSection.getState().setSection(section)}
        />
      )}
    </>
  );
}

// ── Root component — renders all instances ────────────────────────────────────

export default function NodePanel() {
  const { panels, removePanel, removeActive, activatePanel, openPanel, closePanel, closeAllPanels, setCanvasPos } = useNodePanel();
  const { x: stageX, y: stageY, scale } = useViewport();
  const topLayer = useLayerOrder((s) => s.topLayer);
  const konvaNodes = Object.values(useKonvaNodes((s) => s.nodes));

  // The panels half of the shared undo timeline. Every store setter rebuilds
  // the objects it touches, so holding the array is a valid snapshot --
  // nothing mutates a PanelInstance in place.
  useEffect(() => {
    return canvasHistory.register("panels", {
      capture: () => useNodePanel.getState().panels,
      restore: (snap) =>
        useNodePanel.getState().replaceAll(snap as PanelInstance[], (p) => !!kindSpec(p.kind).authored),
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Not while another page covers the board (#206), nor from a field.
      // Capture phase runs before a modal can stop the event, so this has to
      // opt out itself: Backspace on a popup's button must not delete here.
      if (!boardKeyAllowed(e)) return;
      const store = useNodePanel.getState();
      const mod   = e.ctrlKey || e.metaKey;

      // No undo/redo here. There is one timeline and Board owns the only
      // listener; this used to run in capture phase and
      // stopImmediatePropagation its way to priority, which is what made
      // Ctrl+Z non-chronological across node kinds.

      // Delete / Backspace — remove every selected placeholder. Active, not
      // selectedId: after Ctrl+A many panels are selected and selectedId is null.
      if ((e.code === "Delete" || e.code === "Backspace") && store.panels.some((p) => p.isActive)) {
        e.preventDefault();
        removeActive();
        // Keyed on the event: wires and images deleted by the same keypress
        // land in this one undo step.
        canvasHistory.commit(e);
        return;
      }
      // Escape — collapse all panels, keep placeholders.
      if (e.code === "Escape") closeAllPanels();
    };
    // Capture phase ensures this runs before Board.tsx's bubble-phase listener.
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [removeActive, closeAllPanels]);

  return (
    <>
      {panels.map((p, i) => {
        const covered = chromeCovered(p, panels.slice(i + 1), konvaNodes, topLayer, scale);
        return (
        <SinglePanel
          key={p.id}
          instance={p}
          stageX={stageX}
          stageY={stageY}
          scale={scale}
          onActivate={()         => activatePanel(p.id)}
          onOpenPanel={()        => openPanel(p.id)}
          onClosePanel={()       => closePanel(p.id)}
          onRemove={()           => removePanel(p.id)}
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
