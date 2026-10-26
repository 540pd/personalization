import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, panelBoxes, dragFrom, portCount, reloadBoard , setZoom} from "./helpers";

// node > compose (#181): a box the user writes in. No panel, an output port
// and no input, and its text feeds a downstream node as a text reference.

const box = (page: Page) =>
  page.locator(".node-panel-compose-output-layer, button.node-panel-placeholder:not(:has(+ .node-panel-compose-output-layer))").first();
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
  await page.getByRole("button", { name: "Create", exact: true }).click();
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
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.locator(".floating-dock-submenu button")).toHaveText(["Video", "Image", "Prompt", "Compose"]);
    // One divider, between the model-backed items and Compose.
    const order = await page.locator(".floating-dock-submenu > *").evaluateAll((els) =>
      els.map((e) => (e.getAttribute("role") === "separator" ? "|" : e.textContent?.trim()))
    );
    expect(order).toEqual(["Video", "Image", "Prompt", "|", "Compose"]);
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
    // Markdown renders, while the node label still derives from the raw text.
    await expect(page.locator(".node-panel-compose-markdown h1")).toHaveText("Brand brief");
    await expect(page.locator(".node-panel-compose-markdown li")).toHaveText(["warm light", "film grain"]);
    // Named from the first line, without the heading marker.
    await expect(label(page, "Brand brief")).toHaveCount(1);
  });

  test("renders GFM, omits raw HTML and suppresses Markdown images", async ({ page }) => {
    await openBoard(page);
    await addNode(page, /^Compose$/);
    const markdown =
      "# Heading\n\n**bold** *italic* ~~strike~~ `code`\n\n```js\nconst answer = 42;\n```\n\n> quote\n\n- [x] task\n- item\n\n1. first\n2. second\n\n| A | B |\n|---|---|\n| one | two |\n\n---\n\n[link](https://example.com) ![hidden](https://example.com/image.png)\n\n<script>alert(1)</script><b>raw html</b>";
    await write(page, markdown);

    const output = page.locator(".node-panel-compose-markdown");
    await expect(output.locator("h1")).toHaveText("Heading");
    await expect(output.locator("strong")).toHaveText("bold");
    await expect(output.locator("em")).toHaveText("italic");
    await expect(output.locator("del")).toHaveText("strike");
    await expect(output.locator("code").first()).toHaveText("code");
    await expect(output.locator("pre code")).toContainText("const answer = 42;");
    await expect(output.locator("blockquote")).toContainText("quote");
    await expect(output.locator("ul li")).toHaveCount(2);
    await expect(output.locator('input[type="checkbox"]')).toHaveCount(1);
    await expect(output.locator("ol li")).toHaveCount(2);
    await expect(output.locator("table th")).toHaveCount(2);
    await expect(output.locator("hr")).toHaveCount(1);
    await expect(output.locator("a")).toHaveAttribute("rel", "noopener noreferrer");
    await expect(output.locator("img, script, b")).toHaveCount(0);
    await expect(output).toContainText("<script>alert(1)</script>");

    await box(page).dblclick();
    await expect(editor(page)).toHaveValue(markdown);
    await page.keyboard.press("Escape");
  });

  test("uses plain text for content above the Markdown size cap", async ({ page }) => {
    await openBoard(page);
    await addNode(page, /^Compose$/);
    const largeText = `# Large note\n${"x".repeat(8192)}`;
    await write(page, largeText);

    await expect(page.locator(".node-panel-compose-markdown")).toHaveCount(0);
    const displayedText = await page.locator(".node-panel-text-output").textContent();
    expect(displayedText?.startsWith("# Large note")).toBe(true);
  });

  test("keeps the rendered text within the box at common zoom levels", async ({ page }) => {
    await openBoard(page);
    await addNode(page, /^Compose$/);
    const paragraphs = Array.from({ length: 45 }, (_, index) => `Paragraph ${index}: readable content stays in the box.`);
    await write(page, `# Zoom test\n\n${paragraphs.join("\n\n")}`);
    const [node] = await panelBoxes(page);
    await dragFrom(page, node.x + node.w / 2, node.y + node.h / 2, -400);

    const output = page.locator(".node-panel-compose-markdown");
    for (const scale of [0.5, 1, 1.5]) {
      await setZoom(page, scale);
      const dimensions = await output.evaluate((element) => {
        const content = element.getBoundingClientRect();
        const layer = element.parentElement!.getBoundingClientRect();
        return {
          fitsWidth: content.right <= layer.right + 1 && content.left >= layer.left - 1,
          fitsHeight: content.bottom <= layer.bottom + 1 && content.top >= layer.top - 1,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          overflowY: getComputedStyle(element).overflowY,
        };
      });
      expect(dimensions.fitsWidth).toBe(true);
      expect(dimensions.fitsHeight).toBe(true);
      expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
      expect(dimensions.overflowY).toBe("auto");
    }
  });

  test("an unselected link selects the box; a selected link opens safely in a new tab", async ({ page }) => {
    await openBoard(page);
    await addNode(page, /^Compose$/);
    await write(page, "[visit](https://example.com)");
    const link = page.locator(".node-panel-compose-markdown a");

    await clickAway(page);
    const unselectedPopup = page.waitForEvent("popup", { timeout: 500 }).catch(() => null);
    await link.click();
    expect(await unselectedPopup).toBeNull();

    const popup = page.waitForEvent("popup");
    await link.click();
    const opened = await popup;
    await expect(opened).toHaveURL("https://example.com/");
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
    await reloadBoard(page, { panels: 1 });
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
