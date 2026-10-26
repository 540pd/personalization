import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, generateImageV2, generateText, getJob, postJson, startVideo } from "../canvas.api";

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ok({}));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const lastInit = () => fetchMock.mock.calls.at(-1)![1] as RequestInit;
const lastHeaders = () => new Headers(lastInit().headers);

describe("apiFetch", () => {
  it("goes through the proxy", async () => {
    await apiFetch("health");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/proxy/health");
  });

  it("says JSON only when there is a body", async () => {
    await apiFetch("generate/job/1", { method: "GET" });
    expect(lastHeaders().has("Content-Type")).toBe(false);
    await apiFetch("generate/text", { method: "POST", body: "{}" });
    expect(lastHeaders().get("Content-Type")).toBe("application/json");
  });
});

describe("postJson", () => {
  it("POSTs the body as JSON and returns the parsed answer", async () => {
    fetchMock.mockResolvedValueOnce(ok({ text: "hi" }));
    await expect(postJson("generate/text", { a: 1 })).resolves.toEqual({ text: "hi" });
    expect(lastInit()).toMatchObject({ method: "POST", body: '{"a":1}' });
  });

  it("throws the backend's message, or the status", async () => {
    fetchMock.mockResolvedValueOnce(ok({ message: "quota" }, 429));
    await expect(postJson("x", {})).rejects.toThrow("quota");
    fetchMock.mockResolvedValueOnce(new Response("oops", { status: 500 }));
    await expect(postJson("x", {})).rejects.toThrow("Generation failed (500)");
  });

  it("passes the signal through to fetch", async () => {
    const controller = new AbortController();
    await postJson("x", {}, controller.signal);
    expect(lastInit().signal).toBe(controller.signal);
  });
});

describe("generate calls", () => {
  it("thread the signal, so deleting a node cancels its request", async () => {
    const signal = new AbortController().signal;
    await generateImageV2({ modelId: "m", instruction: "i" } as never, signal);
    expect(fetchMock.mock.calls.at(-1)![0]).toBe("/api/proxy/generate/image");
    expect(lastInit().signal).toBe(signal);
    await generateText({ modelId: "m", instruction: "i" }, signal);
    expect(fetchMock.mock.calls.at(-1)![0]).toBe("/api/proxy/generate/text");
    expect(lastInit().signal).toBe(signal);
    await startVideo({ modelId: "m", instruction: "i" } as never, signal);
    expect(fetchMock.mock.calls.at(-1)![0]).toBe("/api/proxy/generate/video");
    expect(lastInit().signal).toBe(signal);
  });
});

describe("getJob", () => {
  it("turns a lost job into a failed state", async () => {
    fetchMock.mockResolvedValueOnce(ok({ message: "not found" }, 404));
    await expect(getJob("j")).resolves.toEqual({ status: "failed", message: "not found" });
  });
});
