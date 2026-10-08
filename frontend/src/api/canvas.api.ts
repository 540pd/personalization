import { getIdToken, notifySessionExpired } from "@/auth/authState";
import type { Board, GenerateImageParams, GenerateImageResult, GenerateImageV2Params, GenerateImageV2Result, GenerateTextParams, GenerateTextResult, GenerateVideoParams, JobAccepted, JobState } from "@/types/canvas.types";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getIdToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  headers.set("Content-Type", "application/json");

  const res = await fetch(`/api/proxy/${path}`, { ...init, headers });

  if (res.status === 401) {
    const body = await res.clone().json().catch(() => ({}));
    if (body?.error === "token_expired") {
      notifySessionExpired();
    }
  }

  return res;
}

export async function getBoards(): Promise<Board[]> {
  const res = await apiFetch("boards");
  if (!res.ok) throw new Error(`getBoards failed: ${res.status}`);
  return res.json();
}

export async function getBoard(id: string): Promise<Board> {
  const res = await apiFetch(`boards/${id}`);
  if (!res.ok) throw new Error(`getBoard failed: ${res.status}`);
  return res.json();
}

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  const res = await apiFetch("generate", {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`generateImage failed: ${res.status}`);
  return res.json();
}

export async function generateImageV2(params: GenerateImageV2Params): Promise<GenerateImageV2Result> {
  const res = await apiFetch("generate/image", {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body?.message ?? `Generation failed (${res.status})`);
  }
  return res.json() as Promise<GenerateImageV2Result>;
}

export async function generateText(params: GenerateTextParams): Promise<GenerateTextResult> {
  const res = await apiFetch("generate/text", {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body?.message ?? `Generation failed (${res.status})`);
  }
  return res.json() as Promise<GenerateTextResult>;
}

/** Starts a video generation. Returns immediately with a job to poll. */
export async function startVideo(params: GenerateVideoParams): Promise<JobAccepted> {
  const res = await apiFetch("generate/video", {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body?.message ?? `Generation failed (${res.status})`);
  }
  return res.json() as Promise<JobAccepted>;
}

/**
 * Polls a job. A 404 is a real answer, not an error: the backend's job store
 * is in-memory, so a restart loses jobs and the client must stop waiting
 * rather than hang.
 */
export async function getJob(jobId: string): Promise<JobState> {
  const res = await apiFetch(`generate/job/${encodeURIComponent(jobId)}`, { method: "GET" });
  const body = await res.json().catch(() => ({})) as JobState & { message?: string };
  if (!res.ok) {
    return { status: "failed", message: body?.message ?? `Job lookup failed (${res.status})` };
  }
  return body;
}
