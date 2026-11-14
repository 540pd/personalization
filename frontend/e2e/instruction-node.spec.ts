import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, collapsePanels, panelBoxes, dragFrom, clickEmpty, portCount, makePng } from "./helpers";

// node > instruction. The point of these is less "text generation works" than
// "the kind registry holds": everything shared — ports, selection, drag,
// labels — must work with no instruction-specific code.

const FAKE_IMAGE = `data:image/png;base64,${makePng(8, 8).toString("base64")}`;

/** Intercept both generate endpoints, recording request bodies and paths. */
async function stubGenerate(page: Page) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/proxy/**", async (route: Route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    const path = new URL(req.url()).pathname;
    let body: Record<string, unknown> = {};
    try { body = req.postDataJSON(); } catch { /* empty body */ }
    calls.push({ path, body });
    const isText = path.endsWith("/generate/text");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        isText
          ? { jobId: "j", status: "done", text: "a quiet harbour at dusk", modelUsed: "gemini-3.5-flash-lite" }
          : { jobId: "j", status: "done", imageUrl: FAKE_IMAGE, modelUsed: "gemini-3.1-flash-image" }
      ),
    });
  });
  return calls;
}

/** Create a node from the dock's Create submenu by its visible label. */
async function addNode(page: Page, label: RegExp) {
  const before = await page.locator("button.node-panel-placeholder").count();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForTimeout(250);
  await page.locator(".floating-dock-submenu button").filter({ hasText: label }).first().click();
  await page.waitForFunction(
    (n) => document.querySelectorAll("button.node-panel-placeholder").length > n,
    before,
    { timeout: 10_000 }
  );
  await page.waitForTimeout(300);
}

async function generateInOpenPanel(page: Page, instruction: string) {
  await page.locator("textarea").first().fill(instruction);
  await page.waitForTimeout(150);
  await page.locator("button.node-panel-create-button").first().click();
  await page.waitForTimeout(1200);
}

test.describe("node > instruction", () => {
  test("creates a node whose panel is a Prompt panel", async ({ page }) => {
    await stubGenerate(page);
    await openBoard(page);
    await addNode(page, /^Prompt$/);

    await expect(page.locator("h2.node-form-header-title")).toHaveText("Prompt");
    // A text node has no aspect ratio or quality to choose.
    await expect(page.locator(".node-panel-options")).toHaveCount(0);
  });

  test("renders generated text inside the node, not overflowing it", async ({ page }) => {
    await stubGenerate(page);
    await openBoard(page);
    await addNode(page, /^Prompt$/);
    await generateInOpenPanel(page, "describe the scene");
    await collapsePanels(page);

    const out = page.locator(".node-panel-text-output");
    await expect(out).toHaveText("a quiet harbour at dusk");

    const [node] = await panelBoxes(page);
    const box = await out.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(node.h + 1);
    expect(box!.width).toBeLessThanOrEqual(node.w + 1);
  });

  test("hits the text endpoint, not the image one", async ({ page }) => {
    const calls = await stubGenerate(page);
    await openBoard(page);
    await addNode(page, /^Prompt$/);
    await generateInOpenPanel(page, "describe the scene");

    expect(calls).toHaveLength(1);
    expect(calls[0].path).toMatch(/\/generate\/text$/);
    // Id from docs/llm_parameter/, not the invented one this originally asserted.
    expect(calls[0].body.modelId).toBe("gemini-3.5-flash-lite");
  });

  // The shared machinery must work with no instruction-specific code.
  test("gets ports, selection and occlusion like any other node", async ({ page }) => {
    await stubGenerate(page);
    await openBoard(page);
    await addNode(page, /^Prompt$/);
    await collapsePanels(page);
    const [first] = await panelBoxes(page);
    await dragFrom(page, first.x + first.w / 2, first.y + first.h / 2, -360);

    await addNode(page, /^Image$/);
    await collapsePanels(page);
    await clickEmpty(page);

    // Two nodes of different kinds, four ports between them.
    expect(await portCount(page)).toBe(4);

    // Dragging the instruction node over the image node hides a port.
    const boxes = (await panelBoxes(page)).sort((a, b) => a.x - b.x);
    await dragFrom(page, boxes[0].x + boxes[0].w / 2, boxes[0].y + boxes[0].h / 2,
                   boxes[1].x + 30 - boxes[0].x, boxes[1].y - boxes[0].y);
    expect(await portCount(page)).toBeLessThan(4);
  });

  test("an upstream instruction node feeds an image node as a text reference", async ({ page }) => {
    const calls = await stubGenerate(page);
    await openBoard(page);

    await addNode(page, /^Prompt$/);
    await generateInOpenPanel(page, "describe the mood");
    await collapsePanels(page);
    const [up] = await panelBoxes(page);
    await dragFrom(page, up.x + up.w / 2, up.y + up.h / 2, -380);

    await addNode(page, /^Image$/);
    await collapsePanels(page);
    const boxes = (await panelBoxes(page)).sort((a, b) => a.x - b.x);
    const source = boxes[0];
    const target = boxes[1];

    await page.mouse.move(source.x + source.w - 2, source.y + source.h * 0.3);
    await page.mouse.down();
    await page.mouse.move(target.x + 2, target.y + target.h * 0.3, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    await page.mouse.click(target.x + 12, target.y + 12);
    await page.waitForTimeout(300);
    await page.mouse.click(target.x + 12, target.y + 12);
    await page.waitForTimeout(600);
    await generateInOpenPanel(page, "paint that mood");

    const last = calls[calls.length - 1];
    expect(last.path).toMatch(/\/generate\/image$/);
    const refs = last.body.references as { kind: string; text?: string; name?: string }[];
    expect(refs).toHaveLength(1);
    // Its content IS the reference — there is no URL to point at.
    expect(refs[0].kind).toBe("text");
    expect(refs[0].text).toBe("a quiet harbour at dusk");
    expect(refs[0].name).toBe("describe the mood");
  });
});
