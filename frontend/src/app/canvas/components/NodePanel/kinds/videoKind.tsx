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
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, POLL_INTERVAL_MS);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("cancelled", "AbortError"));
      }, { once: true });
    });
  }
}

function Advanced({ value, onChange }: SettingsProps) {
  const s = value as VideoSettings;
  return (
    <div className="node-panel-advanced-content">
      <div className="node-panel-advanced-row">
        <div className="node-panel-setting">
          <p className="node-panel-setting-label">Duration</p>
          <select
            aria-label="Duration"
            value={String(s.durationSeconds)}
            onChange={(e) => onChange({ ...s, durationSeconds: Number(e.target.value) })}
            className="node-panel-select"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>{`${d}s`}</option>
            ))}
          </select>
        </div>

        <div className="node-panel-setting">
          <p className="node-panel-setting-label">Resolution</p>
          <select
            aria-label="Resolution"
            value={s.resolution}
            onChange={(e) => onChange({ ...s, resolution: e.target.value })}
            className="node-panel-select"
          >
            {RESOLUTIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="node-panel-placeholder-content">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="node-panel-image-icon"
      >
        <rect x="2" y="5" width="14" height="14" rx="2" />
        <path d="M22 8l-6 4 6 4z" />
      </svg>

      <span className="node-panel-placeholder-text">
        Video will
        <br />
        appear here
      </span>
    </div>
  );
}

function Output({ value }: { value: string }) {
  return <video src={value} controls className="node-panel-video" />;
}

export const videoKind: NodeKindSpec = {
  kind: "video",
  title: "Create Video",
  prompt: "Describe the video...",
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
  async generate({ modelId, instruction, settings, references, onJobStarted, signal }) {
    const s = settings as VideoSettings;
    const { jobId } = await startVideo({
      modelId,
      instruction,
      durationSeconds: s.durationSeconds,
      resolution: s.resolution,
      references: references.length ? references : undefined,
    });
    // Persist before waiting, not after: the wait is where a reload happens.
    onJobStarted?.(jobId);
    return awaitJob(jobId, signal);
  },
  resume: (jobId, signal) => awaitJob(jobId, signal),
};
