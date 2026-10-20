"use client";

// node > video — Gemini Omni.
//
// The first asynchronous kind. Image and instruction return their result in
// the same response; video runs for minutes, so the backend hands back a job
// id and this polls for it. The job id is persisted on the node the moment it
// arrives, which is what lets a reload mid-generation pick the job back up
// instead of losing it.

import { startVideo, getJob } from "@/api/canvas.api";
import { DEFAULT_NODE_MAX_EDGE } from "@/constants/canvas.constants";
import type { PanelOutput } from "@/store/nodePanel.store";
import type { NodeKindSpec, SettingsProps, VideoSettings } from "../nodeKinds";
import { baseRequest, KindPlaceholder, SettingSelect } from "./controls";
import { sleep } from "./sleep";

// From docs/llm_parameter/Veo 3.1 Lite.txt.
//
// Gemini Omni 1.1 Flash is the other video model in that folder; it is not
// offered yet because its API is not in the installed SDK. Adding it is one
// entry here and one branch in the backend capability -- the async job
// contract and this whole file's UI are unaffected.
const MODELS = [
  { id: "veo-3.1-lite-generate-001", label: "Veo 3.1 Lite" },
];

const DURATIONS = ["4", "6", "8"];
const RESOLUTIONS = ["720p", "1080p"];

// 16:9, like the image node's default — video is a landscape medium.
const VIDEO_NODE_SIZE = {
  w: DEFAULT_NODE_MAX_EDGE,
  h: Math.round((DEFAULT_NODE_MAX_EDGE * 9) / 16),
};

const POLL_INTERVAL_MS = 2000;
// Generous, but finite: without a ceiling a job the backend forgot about
// leaves the node spinning forever.
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

async function awaitJob(jobId: string, signal?: AbortSignal): Promise<PanelOutput> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  for (;;) {
    if (signal?.aborted) throw new DOMException("cancelled", "AbortError");

    const state = await getJob(jobId);

    if (state.status === "done") {
      if (!state.videoUrl) throw new Error("Generation finished but returned no video.");
      return { type: "video", value: state.videoUrl };
    }
    if (state.status === "failed") {
      throw new Error(state.message ?? "Video generation failed.");
    }
    if (Date.now() > deadline) {
      throw new Error("Video generation timed out. The job may still be running.");
    }

    // Abort-aware sleep: exits immediately when the node is deleted mid-job.
    await sleep(POLL_INTERVAL_MS, signal);
  }
}

function Advanced({ value, onChange }: SettingsProps) {
  const s = value as VideoSettings;
  return (
    <div className="node-panel-advanced-content">
      <div className="node-panel-advanced-row">
        <SettingSelect
          variant="setting"
          label="Duration"
          options={DURATIONS}
          value={String(s.durationSeconds)}
          format={(d) => `${d}s`}
          onChange={(d) => onChange({ ...s, durationSeconds: Number(d) })}
        />

        <SettingSelect
          variant="setting"
          label="Resolution"
          options={RESOLUTIONS}
          value={s.resolution}
          onChange={(resolution) => onChange({ ...s, resolution })}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <KindPlaceholder
      noun="Video"
      icon={<>
        <rect x="2" y="5" width="14" height="14" rx="2" />
        <path d="M22 8l-6 4 6 4z" />
      </>}
    />
  );
}

function Output({ value }: { value: string }) {
  return <video src={value} controls className="node-panel-video" />;
}

export const videoKind: NodeKindSpec = {
  kind: "video",
  title: "Create Video",
  prompt: "Describe the video...",
  // Skills only, as in an Image panel (#240).
  mentions: "skills",
  models: MODELS,
  // Shortest clip and smallest resolution the picker offers. Video is the
  // slowest and most expensive kind, so the default should be a quick look.
  defaultSettings: { durationSeconds: Number(DURATIONS[0]), resolution: RESOLUTIONS[0] },
  sizeFor: () => VIDEO_NODE_SIZE,
  // Terminal: a workflow ends at a video, so no output port.
  isSource: false,
  EmptyState,
  Output,
  Advanced,
  async generate({ modelId, instruction, settings, references, context, onJobStarted, signal }) {
    const s = settings as VideoSettings;
    const { jobId } = await startVideo({
      modelId,
      instruction,
      durationSeconds: s.durationSeconds,
      resolution: s.resolution,
      ...baseRequest(references, context),
    }, signal);
    // Persist before waiting, not after: the wait is where a reload happens.
    onJobStarted?.(jobId);
    return awaitJob(jobId, signal);
  },
  resume: (jobId, signal) => awaitJob(jobId, signal),
};
