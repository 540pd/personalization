import { describe, it, expect } from "vitest";
import { createJob, completeJob, failJob, getJob } from "../jobStore.js";

const ALICE = "alice@example.com";
const BOB = "bob@example.com";

describe("jobStore", () => {
  it("starts a job pending and readable by its owner", () => {
    const job = createJob(ALICE);
    expect(job.status).toBe("pending");
    expect(getJob(job.id, ALICE)?.status).toBe("pending");
  });

  it("carries the result through to done", () => {
    const job = createJob(ALICE);
    completeJob(job.id, { videoUrl: "data:video/mp4;base64,AA", modelUsed: "mock" });
    const read = getJob(job.id, ALICE);
    expect(read?.status).toBe("done");
    expect(read?.result?.videoUrl).toBe("data:video/mp4;base64,AA");
  });

  it("carries a reason through to failed", () => {
    const job = createJob(ALICE);
    failJob(job.id, "quota exhausted");
    const read = getJob(job.id, ALICE);
    expect(read?.status).toBe("failed");
    expect(read?.error).toBe("quota exhausted");
  });

  // A job id is effectively a bearer token for its result, so it must not be
  // readable by guessing from another account.
  it("does not leak a job to another user", () => {
    const job = createJob(ALICE);
    completeJob(job.id, { videoUrl: "secret", modelUsed: "mock" });
    expect(getJob(job.id, BOB)).toBeNull();
  });

  it("returns null for an unknown id, rather than throwing", () => {
    expect(getJob("no-such-job", ALICE)).toBeNull();
  });

  // Settling a job that was swept, or that belonged to a previous process,
  // must be a no-op — the background work has no way to know.
  it("ignores settling an id that is gone", () => {
    expect(() => completeJob("gone", { videoUrl: "x", modelUsed: "m" })).not.toThrow();
    expect(() => failJob("gone", "x")).not.toThrow();
  });

  it("keeps jobs distinct", () => {
    const a = createJob(ALICE);
    const b = createJob(ALICE);
    expect(a.id).not.toBe(b.id);
    completeJob(a.id, { videoUrl: "a", modelUsed: "m" });
    expect(getJob(b.id, ALICE)?.status).toBe("pending");
  });
});
