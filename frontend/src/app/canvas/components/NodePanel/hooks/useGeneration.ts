import { useEffect, useRef, useState } from "react";
import { useNodePanel, type PanelInstance } from "@/store/nodePanel.store";
import { useFrames } from "@/store/frame.store";
import { useSkills } from "@/store/skills.store";
import { useAgents } from "@/store/agents.store";
import { useGenerating } from "@/store/generating.store";
import { selectOnly } from "@/lib/canvas/selection";
import { canvasHistory } from "@/lib/canvas/history";
import { boundsOf } from "@/lib/canvas/bounds";
// Prompts usually open with boilerplate ("a highly detailed photorealistic
// image of a …"), so first-N-words collides often — hence uniqueLabel on
// every auto-generated name here.
import { labelFromInstruction, relabel, takenLabels, uniqueLabel } from "@/lib/canvas/labels";
import { layoutVariants } from "../../../board/variants";
import { mentionContext, resolveMentions } from "../../../mentions/mentions";
import { generateUpstream, useGenerationProgress } from "../upstreamGeneration";
import type { GenerateDraft } from "../GenerateForm";
import type { NodeKindSpec, NodeSettings } from "../nodeKinds";

/**
 * Running a node's generation. The node owns reference collection and the
 * store writes; the form owns the fields and shows `busy` and `error`.
 * Throwing inside surfaces in the form's error line.
 */
export function useGeneration(
  instance: PanelInstance,
  spec: NodeKindSpec,
  draft: GenerateDraft,
  settings: NodeSettings,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Not an error: made, but without the brand it was asked to use (#452).
  const [notice, setNotice] = useState<string | null>(null);
  const brandFailed = () => setNotice("Made without brand: couldn't load it.");
  // While the nodes wired into this one are generated first (#11).
  const [waiting, setWaiting] = useState(false);
  // This node's own progress when a downstream node is generating it.
  const upstream = useGenerationProgress((s) => s.byId[instance.id]);
  // A batch takes as long as its slowest variant, so say how many are coming
  // rather than showing the same spinner as for one.
  const variantTotal = spec.variantCount?.(settings) ?? 1;
  const busyLabel = waiting
    ? "Waiting for upstream…"
    : variantTotal > 1 ? `Creating ${variantTotal} images…` : undefined;

  // Aborts any in-flight generate call when the node is deleted.
  const generateAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { generateAbort.current?.abort(); }, []);

  /**
   * The node's name once a generation lands, written to the store if it
   * changed. A name the user chose is kept as it is. An auto-derived one
   * follows the instruction just sent (#130): a re-prompted node is renamed
   * for its new prompt, and a downstream node that references it is told what
   * the image now shows. Read from the store, not the render's `instance`:
   * a generation can outlive several renders.
   */
  const nameAfterGenerate = (): string => {
    const store = useNodePanel.getState();
    const current = store.panels.find((p) => p.id === instance.id);
    if (current?.label && !current.labelAuto) return current.label;
    const name = relabel(current?.label, labelFromInstruction(draft.instruction), takenLabels());
    if (name !== current?.label || !current?.labelAuto) store.setLabel(instance.id, name, true);
    return name;
  };

  const generate = async () => {
    if (!draft.instruction.trim() || busy) return;
    // Saved before the request, so variant copies are made from what was sent.
    useNodePanel.getState().setDraft(instance.id, { model: draft.model, instruction: draft.instruction, settings });
    generateAbort.current?.abort();
    const controller = new AbortController();
    generateAbort.current = controller;
    setBusy(true);
    setWaiting(true);
    setError(null);
    setNotice(null);
    useGenerationProgress.getState().setProgress(instance.id, null);
    try {
      // Resolve missing predecessors before taking their references. Each
      // predecessor reads its own saved prompt/settings, not this node's draft.
      const references = await generateUpstream(instance.id, controller.signal);
      if (controller.signal.aborted) return;
      setWaiting(false);

      // Looked up now, by handle: an edited skill applies to this Create.
      const context = spec.mentions
        ? mentionContext(
            resolveMentions(
              draft.instruction,
              { skills: useSkills.getState().skills, agents: useAgents.getState().agents },
              spec.mentions,
            ),
          )
        : undefined;

      // More than one result cannot live in this node -- it holds a single
      // output and feeds a single reference -- so a batch goes to the board
      // as image nodes in a Frame of their own, and this node stays as it was.
      const count = spec.variantCount?.(settings) ?? 1;
      if (count > 1 && spec.generateVariants) {
        const batch = await spec.generateVariants(
          {
            modelId: draft.model,
            instruction: draft.instruction.trim(),
            settings,
            references,
            context,
            onBrandFailed: brandFailed,
            signal: controller.signal,
          },
          count
        );
        if (controller.signal.aborted) return;

        const store = useNodePanel.getState();
        // Named before anything lands, so the copies and their frame can take
        // their names from it.
        const name = nameAfterGenerate();

        // This node is variant 1 and stays put; the frame grows around it and
        // the copies fill the rest of the grid. Every copy is a full Create
        // node with this one's inputs, so any of them can be regenerated alone.
        const source = boundsOf(instance);
        const { frame, cells } = layoutVariants(batch.urls.length, source);
        store.setOutput(instance.id, { type: "image", value: batch.urls[0] });

        const taken = takenLabels();
        const placements = batch.urls.slice(1).map((url, i) => {
          const label = uniqueLabel(name, taken);
          taken.push(label);
          return {
            canvasX: cells[i + 1].x,
            // Panels are centre-anchored vertically; cells are top-left.
            canvasY: cells[i + 1].y + source.h / 2,
            output: { type: "image" as const, value: url },
            label,
          };
        });
        store.addVariants(instance.id, placements);
        const frameId = crypto.randomUUID();
        useFrames.getState().upsert({
          id: frameId,
          canvasX: frame.x, canvasY: frame.y, canvasW: frame.w, canvasH: frame.h,
          label: uniqueLabel(`${name} variants`, taken),
        });
        // One step for the frame, the copies and this node's new image.
        canvasHistory.commit();

        const failed = count - batch.urls.length;
        if (failed) {
          // Not an error -- the ones that worked are on the board -- but the
          // user asked for N and should know they did not get N. The panel
          // stays open for it: selecting the frame would close the form and
          // take the message with it.
          setError(`${failed} of ${count} variants failed to generate.`);
        } else {
          // Hand the selection to the new frame, so its outline and handles
          // show what was created and what belongs to it. A frame's resting
          // look is quiet enough to miss on a white board (#115).
          selectOnly("frame");
          useFrames.getState().select(frameId);
        }
        return;
      }

      const output = await spec.generate({
        modelId: draft.model,
        instruction: draft.instruction.trim(),
        settings,
        references,
        context,
        // Persisted the moment the backend hands it back, so a reload during
        // a multi-minute video generation resumes rather than loses it.
        onJobStarted: (jobId) => useNodePanel.getState().setJob(instance.id, jobId),
        onBrandFailed: brandFailed,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const store = useNodePanel.getState();
      store.setOutput(instance.id, output);
      nameAfterGenerate();
      // The new image and its name are one undo step, as a variants batch
      // already was. Uncommitted, an undo went back past them with no redo
      // to bring them back.
      canvasHistory.commit();
    } catch (err) {
      if (controller.signal.aborted) return;
      // Drop the job: it settled as failed, or we stopped waiting on it.
      // Leaving it would make the node resume a dead job on every reload.
      useNodePanel.getState().setJob(instance.id, undefined);
      setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setWaiting(false);
      }
      if (generateAbort.current === controller) generateAbort.current = null;
    }
  };

  // A generation still running from before this mount -- a reload, or a
  // remount. Only asynchronous kinds supply resume(); for the others a job id
  // can never outlive the page, so there is nothing to pick up.
  const resumedJob = useRef<string | null>(null);
  useEffect(() => {
    const jobId = instance.job;
    if (!jobId || instance.output || !spec.resume) return;
    if (resumedJob.current === jobId) return;
    resumedJob.current = jobId;

    const controller = new AbortController();
    let cancelled = false;
    setBusy(true);
    spec
      .resume(jobId, controller.signal)
      .then((output) => {
        if (cancelled) return;
        useNodePanel.getState().setOutput(instance.id, output);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        useNodePanel.getState().setJob(instance.id, undefined);
        setError(err instanceof Error ? err.message : "Generation failed.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [instance.job, instance.output, instance.id, spec]);

  // Busy too while a downstream node is generating this one.
  const generating = busy || upstream?.status === "generating";
  // Told to the board, so the wires into this node show it (#456).
  useEffect(() => {
    if (!generating) return;
    useGenerating.getState().setGenerating(instance.id, true);
    return () => useGenerating.getState().setGenerating(instance.id, false);
  }, [generating, instance.id]);

  return {
    busy: generating,
    waiting,
    busyLabel,
    error: error ?? upstream?.error ?? null,
    notice,
    /** This node failed while a downstream node was generating it. */
    upstreamError: upstream?.status === "error" ? upstream.error : undefined,
    generate,
  };
}
