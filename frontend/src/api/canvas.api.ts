import { getIdToken, notifySessionExpired } from "@/auth/authState";
import type { GenerateImageV2Params, GenerateImageV2Result, GenerateTextParams, GenerateTextResult, GenerateVideoParams, JobAccepted, JobState } from "@/types/canvas.types";

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getIdToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // A body is JSON unless the caller says what it is: a file upload sends
  // its own type (#323). A GET has no body to describe.
  if (init?.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`/api/proxy/${path}`, { ...init, headers });

  if (res.status === 401) {
    const body = await res.clone().json().catch(() => ({}));
    // Expired, or gone: a cookie cleared by signing out in another tab
    // arrives as no credential at all.
    if (body?.error === "token_expired" || body?.error === "token_missing") {
      notifySessionExpired();
    }
  }

  return res;
}

/**
 * POSTs `body` as JSON and returns the parsed response. A failed request
 * throws with the backend's message, or the status when it sent none.
 * `signal` cancels the request: a node deleted mid-generation stops waiting.
 */
export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err?.message ?? `Generation failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function generateImageV2(params: GenerateImageV2Params, signal?: AbortSignal): Promise<GenerateImageV2Result> {
  return postJson<GenerateImageV2Result>("generate/image", params, signal);
}

export function generateText(params: GenerateTextParams, signal?: AbortSignal): Promise<GenerateTextResult> {
  return postJson<GenerateTextResult>("generate/text", params, signal);
}

/** Starts a video generation. Returns immediately with a job to poll. */
export function startVideo(params: GenerateVideoParams, signal?: AbortSignal): Promise<JobAccepted> {
  return postJson<JobAccepted>("generate/video", params, signal);
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
