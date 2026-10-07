"use client";

// One spec per node kind. This is the ONLY place a kind is enumerated —
// SinglePanel, GenerateForm, KonvaNodePorts, ConnectionOverlay and Board must
// all stay kind-agnostic, so adding a fourth kind means adding an entry here
// and nothing else.
//
// Ships with a single entry on purpose: the abstraction is proved against the
// kind that already exists before instruction and video are built on it.

import type { FC } from "react";
import type { NodeKind, PanelOutput } from "@/store/nodePanel.store";
import type { Reference } from "@/types/canvas.types";
import { DEFAULT_ASPECT_RATIO, placeholderSize } from "@/constants/canvas.constants";

/**
 * What a given model actually takes.
 *
 * Transcribed from docs/llm_parameter, which are the project's own working
 * samples -- the panel used to show the same controls for every model, so
 * Nano Banana Pro offered a Thinking setting it has no config for and
 * Nano Banana 2.1 offered a Temperature it does not set.
 *
 * A caveat worth keeping in mind: a sample shows what that configuration
 * *sets*, which is not quite the same as what the model *accepts*. These
 * follow the samples because that is the only evidence we have.
 */
export interface ModelCapabilities {
  temperature?: boolean;
  thinking?: boolean;
  grounding?: boolean;
  imageSize?: boolean;
  aspectRatio?: boolean;
}

export interface ModelOption {
  id: string;
  label: string;
  /** Omitted means "everything this kind offers". */
  supports?: ModelCapabilities;
}

// Per-kind settings. A union as further kinds land; `kind` on the owning
// PanelInstance is what narrows it.
export interface ImageSettings {
  aspectRatio: string;
  quality: string;
  thinking: string;
  temperature: number;
}

export interface InstructionSettings {
  temperature: number;
}

export interface VideoSettings {
  durationSeconds: number;
  resolution: string;
}

export type NodeSettings = ImageSettings | InstructionSettings | VideoSettings;

export interface SettingsProps {
  value: NodeSettings;
  onChange: (next: NodeSettings) => void;
  /** Which model is selected, so controls it does not take can be hidden. */
  supports: ModelCapabilities;
}

export interface GenerateArgs {
  modelId: string;
  instruction: string;
  settings: NodeSettings;
  references: Reference[];
  /**
   * Asynchronous kinds call this as soon as the backend hands back a job id,
   * so it is persisted before the wait begins. Without it a reload during a
   * multi-minute generation loses the job.
   */
  onJobStarted?: (jobId: string) => void;
}

export interface NodeKindSpec {
  kind: NodeKind;
  /** Panel heading. */
  title: string;
  /** Instruction textarea placeholder. */
  prompt: string;
  models: ModelOption[];
  /**
   * Model selected on a new node. Explicit rather than models[0], so the
   * picker can list models in a sensible reading order while still
   * defaulting to the cheapest one.
   */
  defaultModel?: string;
  defaultSettings: NodeSettings;
  /**
   * The node's footprint for a given settings value, in canvas units.
   *
   * Deliberately not an `aspectRatio` prop threaded through the form: a kind
   * whose size is not ratio-driven (instruction) would have to ignore it, and
   * the parent would still have to know which kinds care. Asking the spec how
   * big the node should be keeps that knowledge in one place.
   */
  sizeFor(settings: NodeSettings): { w: number; h: number };
  /** Empty-state shown before anything is generated. */
  EmptyState: FC;
  /** Renders a completed output inside the node box. */
  Output: FC<{ value: string }>;
  /** Collapsible advanced section. Omit for a kind with no advanced settings. */
  Advanced?: FC<SettingsProps>;
  /** The always-visible row above the submit button. */
  Options?: FC<SettingsProps>;
  /** Performs the generation. Throws on failure; the form surfaces the message. */
  generate(args: GenerateArgs): Promise<PanelOutput>;
  /**
   * Re-attach to a job still running after a reload. Only asynchronous kinds
   * need it; omitting it means this kind's generations cannot outlive a page
   * load, which is true of image and instruction.
   */
  resume?(jobId: string): Promise<PanelOutput>;
}
