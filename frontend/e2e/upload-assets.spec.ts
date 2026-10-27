import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, uploadImage, makePng, reloadBoard, setZoom, imageBox } from "./helpers";

// Uploads into the user's stored assets (#323). The image lands at once with
// its local copy; the original goes up in the background, and the node
// points at the stored asset once it is kept for good.

const ASSET = "/api/proxy/assets/0b9f3c1e-2d4a-4b8e-9f6a-1c2d3e4f5a6b/content";

/** The saved board's image URLs, once the save after a change has run. */
async function savedImageUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("gcos-board-canvas");
    const nodes = raw ? (JSON.parse(raw).nodes as { imageUrl?: string }[]) : [];
    return nodes.map((n) => n.imageUrl ?? "").filter(Boolean);
  });
}

/** POST /assets answers `reply` in turn per call; the asset itself serves a PNG. */
async function stubAssets(page: Page, replies: Array<{ status: number; body: unknown }>) {
  const sent: { type: string; bytes: number }[] = [];
  await page.route("**/api/proxy/assets", async (route: Route) => {
    const req = route.request();
    sent.push({ type: req.headers()["content-type"], bytes: req.postDataBuffer()?.length ?? 0 });
    const reply = replies[Math.min(sent.length - 1, replies.length - 1)];
    await route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
  });
  await page.route(`**${ASSET}`, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: makePng(64, 48) }),
  );
  return sent;
}

const stored = { status: 201, body: { id: "a", url: ASSET, mimeType: "image/png", bytes: 1, source: "upload", durable: true } };
const badge = (page: Page) => page.locator(".upload-badge");

test.describe("Uploads into stored assets (#323)", () => {
  test("a stored upload's node points at the asset, and a reload shows it from there", async ({ page }) => {
    const sent = await stubAssets(page, [stored]);
    await openBoard(page);
    await uploadImage(page, 640, 480, "cat.png");

    // The original file, typed, not the downscaled copy.
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].type).toBe("image/png");
    expect(sent[0].bytes).toBe(makePng(640, 480).length);

    await expect(badge(page)).toHaveCount(0);
    await expect.poll(() => savedImageUrls(page)).toEqual([ASSET]);

    await reloadBoard(page, { shapes: 1 });
    const src = await page.evaluate(() => (window as any).Konva.stages[0].find("Image")[0].image()?.src as string);
    expect(src).toContain(ASSET);
  });

  test("not durable (local dev): the node keeps its own copy, quietly", async ({ page }) => {
    await stubAssets(page, [{ status: 201, body: { ...stored.body, durable: false } }]);
    await openBoard(page);
    await uploadImage(page, 320, 240);
    await expect(badge(page)).toHaveCount(0);
    await expect.poll(async () => (await savedImageUrls(page))[0]?.slice(0, 22)).toBe("data:image/png;base64,");
  });

  test("a failed upload says why on the node; Retry sends it again", async ({ page }) => {
    const sent = await stubAssets(page, [{ status: 413, body: { error: "too_large" } }, stored]);
    await openBoard(page);
    await uploadImage(page, 640, 480);

    await expect(badge(page)).toHaveText(/Too large to save \(25 MB at most\)\s*Retry/);
    // Still usable meanwhile: its local copy.
    expect((await savedImageUrls(page))[0]?.startsWith("data:")).toBe(true);

    await badge(page).getByRole("button", { name: "Retry" }).click();
    await expect(badge(page)).toHaveCount(0);
    expect(sent).toHaveLength(2);
    await expect.poll(() => savedImageUrls(page)).toEqual([ASSET]);
  });

  test("shows Saving… while the upload is on its way", async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route("**/api/proxy/assets", async (route) => {
      await held;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(stored.body) });
    });
    await page.route(`**${ASSET}`, (route) => route.fulfill({ status: 200, contentType: "image/png", body: makePng(64, 48) }));
    await openBoard(page);
    await uploadImage(page, 640, 480);
    await expect(badge(page)).toHaveText("Saving…");
    release();
    await expect(badge(page)).toHaveCount(0);
  });

  for (const zoom of [0.5, 1, 1.5]) {
    test(`at ${zoom * 100}% the badge sits inside the node's bottom-left corner`, async ({ page }) => {
      await stubAssets(page, [{ status: 500, body: {} }]);
      await openBoard(page);
      await uploadImage(page, 640, 480);
      await setZoom(page, zoom);
      const node = await imageBox(page);
      const b = (await badge(page).boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(node.x);
      expect(b.x - node.x).toBeLessThan(12);
      expect(b.y + b.height).toBeLessThanOrEqual(node.y + node.h);
      expect(node.y + node.h - (b.y + b.height)).toBeLessThan(12);
    });
  }
});
