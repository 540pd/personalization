import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, panelBoxes, dragFrom, portCount } from "./helpers";

// node > compose (#181): a box the user writes in. No panel, an output port
// and no input, and its text feeds a downstream node as a text reference.

const box = (page: Page) => page.locator("button.node-panel-placeholder").first();
const editor = (page: Page) => page.locator("textarea.node-panel-compose-editor");
const label = (page: Page, name: string) => page.locator(`div[title="${name}"]`);
// A committed wire's wide, invisible hit path.
const wires = (page: Page) => page.locator('path[stroke-width="12"]');

/** Empty canvas, clear of a node at the viewport centre. */
async function clickAway(page: Page) {
  await page.mouse.click(1100, 100);
  await page.waitForTimeout(250);
}

/** Create a node from the dock's Create submenu by its visible label. */
async function addNode(page: Page, name: RegExp) {
  await page.locator(".floating-dock button").nth(1).click();
  await page.waitForTimeout(250);
  await page.locator(".floating-dock-submenu button").filter({ hasText: name }).first().click();
  await page.waitForTimeout(400);
}

async function write(page: Page, text: string) {
  await box(page).dblclick();
  await expect(editor(page)).toBeFocused();
  await page.keyboard.insertText(text);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

test.describe("node > compose", () => {
  test("Create lists Compose after Prompt", async ({ page }) => {
    await openBoard(page);
    await page.locator(".floating-dock button").nth(1).click();
    await expect(page.locator(".floating-dock-submenu button")).toHaveText(["Video", "Image", "Prompt", "Compose"]);
  });

  test("lands selected with its empty state and no panel", async ({ page }) => {
    await openBoard(page);
    await addNode(page, /^Compose$/);

    await expect(box(page)).toContainText("Double-click to write");
    await expect(page.locator("h2.node-panel-title")).toHaveCount(0);

    // Clicking it again, selected, still opens nothing.
    await box(page).click();
    await page.waitForTimeout(300);
    await expect(page.locator("h2.node-panel-title")).toHaveCount(0);
  });

  test("has an output port and no input port", async ({ page }) => {
    await openBoard(page);
    await addNode(page, /^Compose$/);
    await expect(page.locator('div[title="Output"]')).toHaveCount(1);
    await expect(page.locator('div[title="Input"]')).toHaveCount(0);
    expect(await portCount(page)).toBe(1);
  });

  test("double-click edits in place; Esc saves and shows the text", async ({ page }) => {
    await openBoard(page);
    await addNode(page, /^Compose$/);
    await write(page, "# Brand brief\n- warm light\n- **film grain**");

    await expect(editor(page)).toHaveCount(0);
    // Plain text, markdown kept as typed.
    await expect(page.locator(".node-panel-text-output")).toHaveText("# Brand brief\n- warm light\n- **film grain**");
    // Named from the first line, without the heading marker.
    await expect(label(page, "Brand brief")).toHaveCount(1);
  });

  test("clicking away saves too, and the editor opens with the text", async ({ page }) => {
    await openBoard(page);
    await addNode(page, /^Compose$/);
    await box(page).dblclick();
    await page.keyboard.insertText("first draft");
    await clickAway(page);
    await expect(editor(page)).toHaveCount(0);
    await expect(page.locator(".node-panel-text-output")).toHaveText("first draft");

    await box(page).dblclick();
    await expect(editor(page)).toHaveValue("first draft");
  });

  test("the auto name follows edits until renamed", async ({ page }) => {
    await openBoard(page);
    await addNode(page, /^Compose$/);
    await write(page, "harbour notes");
    await expect(label(page, "harbour notes")).toHaveCount(1);

    await box(page).dblclick();
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText("> city notes");
    await page.keyboard.press("Escape");
    await expect(label(page, "city notes")).toHaveCount(1);
    await expect(label(page, "harbour notes")).toHaveCount(0);
  });

  test("keys typed in the editor never act on the board", async ({ page }) => {
    await openBoard(page);
    await addNode(page, /^Compose$/);
    await box(page).dblclick();
    await page.keyboard.insertText("abc");
    // Delete/Backspace would delete the selected node; T arms the Text tool.
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Delete");
    await page.keyboard.type(" t v");
    await page.keyboard.press("Escape");

    await expect(page.locator("button.node-panel-placeholder")).toHaveCount(1);
    await expect(page.locator(".node-panel-text-output")).toHaveText("ab t v");
  });

  test("an edit is one undo step, and an undone delete brings the text back", async ({ page }) => {
    await openBoard(page);
    await addNode(page, /^Compose$/);
    await write(page, "first");
    await write(page, " second");
    await expect(page.locator(".node-panel-text-output")).toHaveText("first second");

    // Delete, then undo: the box returns with everything written in it.
    await page.keyboard.press("Delete");
    await expect(page.locator("button.node-panel-placeholder")).toHaveCount(0);
    await page.keyboard.press("Control+Z");
    await expect(page.locator(".node-panel-text-output")).toHaveText("first second");

    // Each closed edit is its own step, name included.
    await page.keyboard.press("Control+Z");
    await expect(page.locator(".node-panel-text-output")).toHaveText("first");
    await expect(label(page, "first")).toHaveCount(1);
    await page.keyboard.press("Control+Z");
    await expect(box(page)).toContainText("Double-click to write");
    await page.keyboard.press("Control+Y");
    await expect(page.locator(".node-panel-text-output")).toHaveText("first");
  });

  test("keeps its text through a reload", async ({ page }) => {
    await openBoard(page);
    await addNode(page, /^Compose$/);
    await write(page, "kept across reloads");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await expect(page.locator(".node-panel-text-output")).toHaveText("kept across reloads");
  });

  test("feeds a Prompt node as a text reference, and takes no wire itself", async ({ page }) => {
    const calls: Record<string, unknown>[] = [];
    await page.route("**/api/proxy/**", async (route: Route) => {
      if (route.request().method() !== "POST") return route.continue();
      calls.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jobId: "j", status: "done", text: "ok", modelUsed: "gemini-3.5-flash-lite" }),
      });
    });
    await openBoard(page);

    await addNode(page, /^Compose$/);
    await write(page, "# Style guide\nmuted palette");
    const [c] = await panelBoxes(page);
    await dragFrom(page, c.x + c.w / 2, c.y + c.h / 2, -380);

    await addNode(page, /^Prompt$/);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const [source, target] = (await panelBoxes(page)).sort((a, b) => a.x - b.x);

    // Prompt → Compose: dropped on the Compose box's left edge, refused.
    await page.mouse.move(target.x + target.w - 2, target.y + target.h * 0.3);
    await page.mouse.down();
    await page.mouse.move(source.x + 2, source.y + source.h * 0.3, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(wires(page)).toHaveCount(0);

    // Compose → Prompt.
    await page.mouse.move(source.x + source.w - 2, source.y + source.h * 0.3);
    await page.mouse.down();
    await page.mouse.move(target.x + 2, target.y + target.h * 0.3, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await expect(wires(page)).toHaveCount(1);

    // Open the Prompt panel and generate.
    await page.mouse.click(target.x + 12, target.y + 12);
    await page.waitForTimeout(300);
    await page.mouse.click(target.x + 12, target.y + 12);
    await page.waitForTimeout(500);
    await page.locator("textarea").first().fill("summarise the guide");
    await page.locator("button.node-panel-create-button").first().click();
    await page.waitForTimeout(1000);

    expect(calls).toHaveLength(1);
    const refs = calls[0].references as { kind: string; text?: string; name?: string }[];
    expect(refs).toEqual([{ kind: "text", text: "# Style guide\nmuted palette", name: "Style guide" }]);
  });
});
