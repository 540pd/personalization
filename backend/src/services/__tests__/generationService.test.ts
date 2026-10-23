import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageCapability } from "../../capabilities/types.js";

const { getCapability } = vi.hoisted(() => ({
  getCapability: vi.fn(),
}));

vi.mock("../../capabilities/index.js", () => ({ getCapability }));

import { generateImageV2 } from "../generationService.js";

describe("generationService", () => {
  const result = { imageUrl: "https://example.test/image.png", modelUsed: "test-model" };
  const capability: ImageCapability = {
    generateV2: vi.fn().mockResolvedValue(result),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCapability).mockReturnValue(capability);
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
