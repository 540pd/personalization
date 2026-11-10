import { test, expect, type Page } from "@playwright/test";
import { openBoard, addPanel, addPanelAt, collapsePanels, dragFrom, panelBoxes, uploadImage, imageBox, type Box } from "./helpers";

// #456: how wires and ports look. Wiring itself is covered by the specs that
// already drive it (ports, wire-drag-select, frame); this is only the look:
// filled ports, the selection halo, the dash while generating, and a wire
// that doubles back going round its source instead of across it.

const centreOf = (page: Page, title: "Input" | "Output") =>
  page.evaluate(
    (t) =>
      [...document.querySelectorAll(`div[title="${t}"]`)].map((d) => {
        const r = d.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }),
    title,
  );

/** The port of `title` nearest x on `box`'s edge. */
async function portOn(page: Page, title: "Input" | "Output", x: number) {
  return (await centreOf(page, title)).reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
}

async function wire(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** An uploaded image wired into a Create Image node to its right. */
async function imageIntoNode(page: Page): Promise<Box> {
  await openBoard(page);
  await uploadImage(page, 200, 150);
  await addPanelAt(page, 420);
  const img = await imageBox(page);
  const [node] = await panelBoxes(page);
  await wire(page, await portOn(page, "Output", img.x + img.w), await portOn(page, "Input", node.x));
  await expect(page.locator("g.board-wire")).toHaveCount(1);
  return node;
}

/** Points along the visible wire, in screen px. */
const along = (page: Page) =>
  page.evaluate(() => {
    const p = document.querySelector("path.board-wire-line") as SVGPathElement;
    const len = p.getTotalLength();
    return Array.from({ length: 101 }, (_, i) => {
      const pt = p.getPointAtLength((len * i) / 100);
      return { x: pt.x, y: pt.y };
    });
  });

test.describe("wire and port look (#456)", () => {
  test("a port with a wire on it is filled, and a selected wire has a halo", async ({ page }) => {
    await imageIntoNode(page);
    // The image's output and the node's input; the node's own output is free.
    await expect(page.locator(".board-port.is-connected")).toHaveCount(2);
    await expect(page.locator('div[title="Output"].is-connected')).toHaveCount(1);
    await expect(page.locator('div[title="Input"].is-connected')).toHaveCount(1);

    // Selected on creation; selecting something else clears it.
    await expect(page.locator("g.board-wire.is-selected .board-wire-halo")).toHaveCount(1);
    const img = await imageBox(page);
    await page.mouse.click(img.x + img.w / 2, img.y + img.h / 2);
    await expect(page.locator(".board-wire-halo")).toHaveCount(0);
    await expect(page.locator("g.board-wire.is-selected")).toHaveCount(0);
  });

  test("the wires into a generating node move, and stop when it fails", async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route("**/api/proxy/generate/**", async (route) => {
      await held;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) });
    });
    const node = await imageIntoNode(page);

    // Open the node's form; a click cycles inactive → active → open.
    for (let i = 0; i < 2 && !(await page.locator("textarea").count()); i++) {
      await page.mouse.click(node.x + node.w / 2, node.y + node.h / 2);
      await page.waitForTimeout(400);
    }
    await page.locator("textarea").first().fill("a harbour at dawn");
    await page.locator("button.node-panel-create-button").first().click();

    await expect(page.locator("g.board-wire.is-flowing")).toHaveCount(1);
    release();
    await expect(page.locator("g.board-wire.is-flowing")).toHaveCount(0);
  });

  test("a wire to a node behind its source goes round the source, not across it", async ({ page }) => {
    await openBoard(page);
    await addPanelAt(page, 250);
    await addPanel(page);
    await collapsePanels(page);
    // The second node, moved behind and below the first.
    const fresh = (await panelBoxes(page)).reduce((a, b) => (b.x < a.x ? b : a));
    await dragFrom(page, fresh.x + fresh.w / 2, fresh.y + fresh.h / 2, -200, 260);

    const [source, target] = (await panelBoxes(page)).sort((a, b) => b.x - a.x);
    expect(target.x + target.w).toBeLessThan(source.x + source.w);
    await wire(page, await portOn(page, "Output", source.x + source.w), await portOn(page, "Input", target.x));
    await expect(page.locator("g.board-wire")).toHaveCount(1);

    // Nothing of it inside the source, bar the few px at the port itself.
    const inside = (await along(page)).filter(
      (p) => p.x > source.x + 2 && p.x < source.x + source.w - 2 && p.y > source.y + 2 && p.y < source.y + source.h - 2,
    );
    expect(inside).toEqual([]);
  });
});
