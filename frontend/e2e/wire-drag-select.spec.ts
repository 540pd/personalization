import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, panelBoxes, dragFrom, uploadImage, imageBox, type Box } from "./helpers";
import { PORT_FRACTION } from "../src/constants/canvas.constants";

// #184: dragging a wire out of an output port must not select text. The port
// started the wire on pointerdown but left the browser's mousedown alone, so
// the same drag also selected every piece of text between the press and the
// drop -- a Prompt node's output lit up blue once wired to a later node.

// The text node's Create item: "Instruction" on main, "Prompt" once #179 lands.
const TEXT_ITEM = /^(Prompt|Instruction)$/;

async function stubText(page: Page) {
  await page.route("**/api/proxy/**", async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "j", status: "done", text: "line one\nline two", modelUsed: "m" }),
    });
  });
}

async function addNode(page: Page, name: RegExp) {
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForTimeout(250);
  await page.locator(".floating-dock-submenu button").filter({ hasText: name }).first().click();
  await page.waitForTimeout(400);
}

/** Press on a source's output port and drop on a node's input port. */
async function wire(page: Page, from: { x: number; y: number }, to: Box) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x + 2, to.y + to.h * 0.3, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

const selection = (page: Page) => page.evaluate(() => String(window.getSelection()));
const wires = (page: Page) => page.locator('path[stroke-width="12"]');

test.describe("wire drag text selection (#184)", () => {
  test("wiring a Prompt node to a later node selects no text", async ({ page }) => {
    await stubText(page);
    await openBoard(page);

    await addNode(page, TEXT_ITEM);
    await page.locator("textarea").first().fill("x");
    await page.locator("button.node-panel-create-button").first().click();
    await expect(page.locator(".node-panel-text-output")).toHaveText("line one\nline two");
    await page.keyboard.press("Escape");
    const [p] = await panelBoxes(page);
    await dragFrom(page, p.x + p.w / 2, p.y + p.h / 2, -300);

    await addNode(page, /^Image$/);
    await page.keyboard.press("Escape");
    const [source, target] = (await panelBoxes(page)).sort((a, b) => a.x - b.x);

    await wire(page, { x: source.x + source.w - 2, y: source.y + source.h * 0.3 }, target);
    await expect(wires(page)).toHaveCount(1);
    expect(await selection(page)).toBe("");
  });

  test("wiring an uploaded image across a Prompt node selects no text", async ({ page }) => {
    await stubText(page);
    await openBoard(page);

    // A Prompt node with text, left of centre.
    await addNode(page, TEXT_ITEM);
    await page.locator("textarea").first().fill("x");
    await page.locator("button.node-panel-create-button").first().click();
    await expect(page.locator(".node-panel-text-output")).toHaveText("line one\nline two");
    await page.keyboard.press("Escape");
    const [p] = await panelBoxes(page);
    await dragFrom(page, p.x + p.w / 2, p.y + p.h / 2, -300);

    // An uploaded image, and an Image node to wire it into.
    await uploadImage(page, 200, 150);
    const img = await imageBox(page);
    await addNode(page, /^Image$/);
    await page.keyboard.press("Escape");
    const target = (await panelBoxes(page)).sort((a, b) => b.x - a.x)[0];
    await dragFrom(page, target.x + target.w / 2, target.y + target.h / 2, 260, 120);
    const moved = (await panelBoxes(page)).sort((a, b) => b.x - a.x)[0];

    await wire(page, { x: img.x + img.w + 2, y: img.y + img.h * PORT_FRACTION }, moved);
    await expect(wires(page)).toHaveCount(1);
    expect(await selection(page)).toBe("");
  });
});
