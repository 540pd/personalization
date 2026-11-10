import { test, expect, type Page } from "@playwright/test";
import { addPanel, collapsePanels, makePng, openBoard, reloadBoard, showEveryMenuItem } from "./helpers";

const first = `data:image/png;base64,${makePng(60, 40, [180, 90, 40]).toString("base64")}`;
const second = `data:image/png;base64,${makePng(50, 30, [40, 90, 180]).toString("base64")}`;

async function addVideo(page: Page) {
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.locator(".floating-dock-submenu button").filter({ hasText: /^Video$/ }).first().click();
}

test("generated images and video retain their individual media on reload (#36)", async ({ page }) => {
  await showEveryMenuItem(page);
  // This simulates the backend's inline fallback (no durable asset store).
  // Durable /api/proxy/assets/... URLs are already stored as-is.
  await openBoard(page);
  // Record a short real clip so playback, not just the src attribute, can be
  // checked after reload. Chromium supports MediaRecorder with WebM.
  const video = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d")!;
    const recorder = new MediaRecorder(canvas.captureStream(20), { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    recorder.start();
    context.fillStyle = "red";
    context.fillRect(0, 0, 32, 32);
    await new Promise((resolve) => setTimeout(resolve, 300));
    context.fillStyle = "blue";
    context.fillRect(0, 0, 32, 32);
    await new Promise((resolve) => setTimeout(resolve, 300));
    recorder.stop();
    await stopped;
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(new Blob(chunks, { type: "video/webm" }));
    });
  });
  let images = 0;
  await page.route("**/api/proxy/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/generate/image")) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ imageUrl: [first, second][images++] }) });
    }
    if (path.endsWith("/generate/video")) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ jobId: "job-1", status: "pending" }) });
    }
    if (path.endsWith("/generate/job/job-1")) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ jobId: "job-1", status: "done", videoUrl: video }) });
    }
    return route.continue();
  });
  for (const prompt of ["first picture", "second picture"]) {
    await addPanel(page);
    await page.locator("textarea").first().fill(prompt);
    await page.locator("button.node-panel-create-button").click();
    await expect(page.locator("button.node-panel-placeholder img")).toHaveCount(images);
    await collapsePanels(page);
  }
  await addVideo(page);
  await page.locator("textarea").first().fill("a harbour at dusk");
  await page.locator("button.node-panel-create-button").click();
  await expect(page.locator("button.node-panel-placeholder video")).toHaveAttribute("src", video, { timeout: 15_000 });

  // Wait for IndexedDB writes before a hard reload: they are asynchronous.
  await page.waitForFunction(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("gcos-panel-media", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const count = await new Promise<number>((resolve) => {
        const request = db.transaction("outputs", "readonly").objectStore("outputs").count();
        request.onsuccess = () => resolve(request.result);
      });
      return count >= 3;
    } finally { db.close(); }
  });
  await reloadBoard(page, { panels: 3 });
  await expect.poll(() => page.locator("button.node-panel-placeholder img").evaluateAll((els) =>
    els.map((el) => el.getAttribute("src")))).toEqual([first, second]);
  await expect(page.locator("button.node-panel-placeholder video")).toHaveAttribute("src", video);
  const playback = await page.locator("button.node-panel-placeholder video").evaluate(async (element) => {
    const media = element as HTMLVideoElement;
    media.muted = true;
    await media.play();
    return !media.paused && media.videoWidth > 0;
  });
  expect(playback).toBe(true);
  await expect(page.locator("button.node-panel-placeholder")).toHaveCount(3);
});