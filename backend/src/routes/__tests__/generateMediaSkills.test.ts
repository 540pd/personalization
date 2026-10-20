import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The prompt's @skills on the image and video routes (#240). Capabilities are
// stubbed, so what reaches them -- the prompt with its skills ahead -- is
// what's checked.
const { generateV2, generateVideo } = vi.hoisted(() => ({
  generateV2: vi.fn(),
  generateVideo: vi.fn(),
}));

vi.mock("../../capabilities/index.js", () => ({
  getCapability: () => ({ generateV2 }),
  getTextCapability: () => ({ generateText: vi.fn() }),
  getVideoCapability: () => ({ generateVideo, getVideo: vi.fn() }),
}));

import { createApp } from "../../server.js";

const app = createApp();
const skills = [{ name: "brand-voice", content: "Warm, direct." }];
const withBrandVoice = "## Skill: brand-voice\n\nWarm, direct.\n\n## Prompt\n\na poster in @brand-voice";

describe("@skills on image and video (#240)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateV2.mockResolvedValue({ imageUrl: "https://example.test/1.png", modelUsed: "m" });
    generateVideo.mockResolvedValue({ videoUrl: "https://example.test/1.mp4", modelUsed: "v" });
  });

  const image = (extra: Record<string, unknown>) =>
    request(app)
      .post("/api/generate/image")
      .send({ modelId: "gemini-3.1-flash-image", instruction: "a poster in @brand-voice", aspectRatio: "1:1", ...extra });

  it("puts each skill ahead of an image prompt", async () => {
    const res = await image({ skills });
    expect(res.status).toBe(200);
    expect(generateV2.mock.calls[0][0].instruction).toBe(withBrandVoice);
  });

  it("does the same for every variant", async () => {
    await image({ skills, variants: 2 });
    expect(generateV2).toHaveBeenCalledTimes(2);
    for (const [params] of generateV2.mock.calls) expect(params.instruction).toBe(withBrandVoice);
  });

  it("leaves a prompt without skills as it was, and ignores an agent", async () => {
    await image({ agent: { name: "copywriter", instructions: "Write." } });
    expect(generateV2.mock.calls[0][0].instruction).toBe("a poster in @brand-voice");
  });

  it("refuses malformed skills before generating", async () => {
    const res = await image({ skills: [{ name: "x" }] });
    expect(res.status).toBe(400);
    expect(generateV2).not.toHaveBeenCalled();
  });

  it("reads references, preferring the image route's older referenceImages name", async () => {
    await image({ references: [{ url: "data:new" }] });
    expect(generateV2.mock.calls[0][0].references).toEqual([{ kind: "image", url: "data:new" }]);
    await image({ references: [{ url: "data:new" }], referenceImages: ["data:old"] });
    expect(generateV2.mock.calls[1][0].references).toEqual([{ kind: "image", url: "data:old" }]);
  });

  it("puts each skill ahead of a video prompt, and refuses malformed ones before a job", async () => {
    const video = (extra: Record<string, unknown>) =>
      request(app)
        .post("/api/generate/video")
        .send({ modelId: "veo-3.1-lite-generate-001", instruction: "a poster in @brand-voice", ...extra });
    const res = await video({ skills });
    expect(res.status).toBe(202);
    expect(generateVideo.mock.calls[0][0].instruction).toBe(withBrandVoice);
    expect((await video({ skills: "brand-voice" })).status).toBe(400);
    expect(generateVideo).toHaveBeenCalledTimes(1);
  });
});
