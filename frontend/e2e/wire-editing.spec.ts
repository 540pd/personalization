import { test, expect, type Page } from "@playwright/test";
import { openBoard, addPanelAt, panelBoxes, zoom, type Box } from "./helpers";

// #458: wiring without precise aiming, and changing a wire without the
// keyboard: lit-up targets, drop on a node, Escape, the delete button, and
// moving a wire by its input end.

const wires = (page: Page) => page.locator('svg g > path[stroke-width="12"]');

/** Three Create Image nodes in a row, left to right. */
async function threeNodes(page: Page): Promise<[Box, Box, Box]> {
  await openBoard(page);
  await addPanelAt(page, -380);
  await addPanelAt(page, 0);
  await addPanelAt(page, 380);
  const boxes = (await panelBoxes(page)).sort((a, b) => a.x - b.x);
  expect(boxes).toHaveLength(3);
  return [boxes[0], boxes[1], boxes[2]];
}

/**
 * Zoom with the wheel over empty board above the nodes. The shared setZoom
 * wheels at (700, 430), which is on the middle node here, so it never zoomed.
 */
async function zoomTo(page: Page, target: number) {
  for (let i = 0; i < 48 && Math.abs((await zoom(page)) - target) >= 0.02; i++) {
    await page.mouse.move(700, 150);
    await page.mouse.wheel(0, (await zoom(page)) > target ? 120 : -120);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(250);
  expect(await zoom(page)).toBeCloseTo(target, 1);
}

const output = (b: Box) => ({ x: b.x + b.w, y: b.y + b.h * 0.3 });
const input = (b: Box) => ({ x: b.x, y: b.y + b.h * 0.3 });
const body = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h * 0.7 });

async function press(page: Page, at: { x: number; y: number }) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
}

async function moveTo(page: Page, at: { x: number; y: number }) {
  await page.mouse.move(at.x, at.y, { steps: 20 });
  await page.waitForTimeout(150);
}

async function release(page: Page) {
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** The wired input's x, to tell which node a wire ends on. */
const wiredInputs = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('div[title="Input"].is-connected')].map((d) => {
      const r = d.getBoundingClientRect();
      return Math.round(r.x + r.width / 2);
    }),
  );

const wireMid = (page: Page) =>
  page.evaluate(() => {
    const p = document.querySelector('svg g > path[stroke-width="12"]') as SVGPathElement;
    const pt = p.getPointAtLength(p.getTotalLength() / 2);
    return { x: pt.x, y: pt.y };
  });

test.describe("easier wiring (#458)", () => {
  for (const level of [0.5, 1, 1.5]) {
    test(`a wire dropped on a node's body connects to its input at ${level * 100}% zoom`, async ({ page }) => {
      const [a, b] = await threeNodes(page);
      let [na, nb] = [a, b];
      if (level !== 1) {
        await zoomTo(page, level);
        [na, nb] = (await panelBoxes(page)).sort((p, q) => p.x - q.x);
      }

      await press(page, output(na));
      await moveTo(page, body(nb));
      // Every node but the source lights up; the input of the one under the
      // pointer is the landing port. No node is outlined since #460.
      await expect(page.locator(".board-port.is-target")).toHaveCount(2);
      await expect(page.locator(".board-port.is-landing")).toHaveCount(1);
      await expect(page.locator("rect.board-wire-target")).toHaveCount(0);
      await release(page);

      await expect(wires(page)).toHaveCount(1);
      expect(await wiredInputs(page)).toEqual([Math.round(nb.x)]);
      await expect(page.locator(".board-port.is-target")).toHaveCount(0);
    });
  }

  test("a node already wired from the source doesn't light up again", async ({ page }) => {
    const [a, b] = await threeNodes(page);
    await press(page, output(a));
    await moveTo(page, body(b));
    await release(page);

    await press(page, output(a));
    await moveTo(page, { x: a.x + a.w + 40, y: a.y - 40 });
    await expect(page.locator(".board-port.is-target")).toHaveCount(1);
    await release(page);
    await expect(wires(page)).toHaveCount(1);
  });

  test("Escape lets go of a wire without making one", async ({ page }) => {
    const [a, b] = await threeNodes(page);
    await press(page, output(a));
    await moveTo(page, body(b));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    await expect(page.locator(".board-wire-preview")).toHaveCount(0);
    await release(page);
    await expect(wires(page)).toHaveCount(0);
  });

  test("the × on a wire deletes it, and undo brings it back", async ({ page }) => {
    const [a, b] = await threeNodes(page);
    await press(page, output(a));
    await moveTo(page, body(b));
    await release(page);

    // Selected on creation, so the button shows; hovering shows it too.
    const del = page.getByRole("button", { name: "Delete link" });
    await expect(del).toHaveCount(1);
    // Empty board, inside the 1280 × 720 viewport, so the wire is deselected.
    await page.mouse.click(1000, 150);
    await expect(page.locator("g.board-wire.is-selected")).toHaveCount(0);
    await expect(del).toHaveCount(0);
    const mid = await wireMid(page);
    await page.mouse.move(mid.x, mid.y);
    await expect(del).toHaveCount(1);

    await del.click();
    await expect(wires(page)).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(wires(page)).toHaveCount(1);
  });

  test("a wire picked up by its input end moves to another node, or goes when dropped on nothing", async ({ page }) => {
    const [a, b, c] = await threeNodes(page);
    await press(page, output(a));
    await moveTo(page, body(b));
    await release(page);
    expect(await wiredInputs(page)).toEqual([Math.round(b.x)]);

    // Moved from B to C: still one wire, now into C.
    await press(page, input(b));
    await moveTo(page, body(c));
    await release(page);
    await expect(wires(page)).toHaveCount(1);
    expect(await wiredInputs(page)).toEqual([Math.round(c.x)]);

    // Put back on its own port: nothing changes.
    await press(page, input(c));
    await moveTo(page, { x: c.x - 60, y: c.y - 60 });
    await moveTo(page, input(c));
    await release(page);
    expect(await wiredInputs(page)).toEqual([Math.round(c.x)]);

    // Dropped on empty board: removed, and undo brings it back.
    await press(page, input(c));
    await moveTo(page, { x: c.x + c.w / 2, y: Math.max(40, c.y - 120) });
    await release(page);
    await expect(wires(page)).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(wires(page)).toHaveCount(1);
  });

  test("a move that would make a duplicate removes the wire instead", async ({ page }) => {
    const [a, b, c] = await threeNodes(page);
    for (const to of [b, c]) {
      await press(page, output(a));
      await moveTo(page, body(to));
      await release(page);
    }
    await expect(wires(page)).toHaveCount(2);

    await press(page, input(b));
    await moveTo(page, body(c));
    // C already has a wire from A, so it isn't a target.
    await expect(page.locator(".board-port.is-landing")).toHaveCount(0);
    await moveTo(page, input(c));
    await release(page);
    await expect(wires(page)).toHaveCount(1);
    expect(await wiredInputs(page)).toEqual([Math.round(c.x)]);
  });
});
