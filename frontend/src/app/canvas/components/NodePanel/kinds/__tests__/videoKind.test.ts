// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getJob } from "@/api/canvas.api";
import { sleep } from "../sleep";
import { videoKind } from "../videoKind";

vi.mock("@/api/canvas.api", () => ({ getJob: vi.fn(), startVideo: vi.fn() }));
vi.mock("../sleep", () => ({ sleep: vi.fn(async () => {}) }));

const poll = vi.mocked(getJob);
const done = { status: "done", videoUrl: "https://v", modelUsed: "m" } as Awaited<ReturnType<typeof getJob>>;

beforeEach(() => {
  poll.mockReset();
  vi.mocked(sleep).mockReset();
});

describe("videoKind polling", () => {
  it("keeps polling after a lookup that failed, and still gets the video (#71)", async () => {
    poll.mockRejectedValueOnce(new Error("Failed to fetch")).mockRejectedValueOnce(new Error("Job lookup failed (502)")).mockResolvedValueOnce(done);
    await expect(videoKind.resume!("j1")).resolves.toEqual({ type: "video", value: "https://v" });
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it("stops when the job itself failed", async () => {
    poll.mockResolvedValueOnce({ status: "failed", message: "Job not found." } as Awaited<ReturnType<typeof getJob>>);
    await expect(videoKind.resume!("j1")).rejects.toThrow("Job not found.");
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("gives up at the time limit when lookups never succeed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Each wait between polls moves the clock on by a minute.
    vi.mocked(sleep).mockImplementation(async () => { vi.setSystemTime(Date.now() + 60_000); });
    poll.mockImplementation(() => Promise.reject(new Error("Failed to fetch")));
    await expect(videoKind.resume!("j1")).rejects.toThrow("timed out");
    vi.useRealTimers();
  });
});
