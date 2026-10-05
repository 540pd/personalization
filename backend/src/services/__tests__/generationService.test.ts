import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageCapability } from "../../capabilities/types.js";

const { getCapability } = vi.hoisted(() => ({
  getCapability: vi.fn(),
}));

vi.mock("../../capabilities/index.js", () => ({ getCapability }));

import { generateImage, generateImageV2 } from "../generationService.js";

describe("generationService", () => {
  const result = { imageUrl: "https://example.test/image.png", modelUsed: "test-model" };
  const capability: ImageCapability = {
    generate: vi.fn().mockResolvedValue(result),
    generateV2: vi.fn().mockResolvedValue(result),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCapability).mockReturnValue(capability);
  });

  it("delegates legacy image generation to the selected capability", async () => {
    const params = { prompt: "A test image", aspectRatio: "1:1" as const, userId: "user-1" };

    await expect(generateImage(params)).resolves.toEqual(result);
    expect(capability.generate).toHaveBeenCalledWith(params);
  });

  it("delegates v2 image generation to the selected capability", async () => {
    const params = {
      modelId: "test-model",
      instruction: "A test image",
      aspectRatio: "3:4" as const,
      userId: "user-1",
    };

    await expect(generateImageV2(params)).resolves.toEqual(result);
    expect(capability.generateV2).toHaveBeenCalledWith(params);
  });
});
