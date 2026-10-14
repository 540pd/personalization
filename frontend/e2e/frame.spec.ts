import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, imageBox, addPanel, panelBoxes, collapsePanels } from "./helpers";

// A frame is a labelled backdrop, not a container: it sits behind the nodes
// and does not own them.

const pointerBtn = (page: Page) => page.locator(".floating-dock button").nth(0);
// Frame is the first right-side tool, and the only one past Links carrying
// aria-pressed besides Upload.
const frameBtn = (page: Page) =>
  page.locator('.floating-dock button[aria-pressed]').nth(3);

/** Drag on the board from one point to another. */
async function drawFrame(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** Frames registered in konvaNodes, read back from the page. */
const frameCount = (page: Page) =>
  page.evaluate(() => {
    const stages = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva.stages;
    // Frames paint on their own stage; sum across both so the assertion does
    // not depend on which stage mounted first.
    return stages.reduce((n, s) => n + s.find(".frame").length, 0);
  });

test.describe("frame tool", () => {
  test("arms from the dock, draws on drag, then returns to pointer", async ({ page }) => {
    await openBoard(page);
    const pointer = pointerBtn(page);
    const frame = frameBtn(page);

    await expect(frame).toHaveAttribute("aria-pressed", "false");
    await frame.click();
    await expect(frame).toHaveAttribute("aria-pressed", "true");
    await expect(pointer).toHaveAttribute("aria-pressed", "false");

    await drawFrame(page, 500, 200, 800, 420);
    expect(await frameCount(page)).toBe(1);

    // Armed for one draw: the next drag moves rather than drawing again.
    await expect(pointer).toHaveAttribute("aria-pressed", "true");
    await expect(frame).toHaveAttribute("aria-pressed", "false");
  });

  test("a drag under the minimum creates nothing", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();

    await drawFrame(page, 500, 200, 508, 206);
    expect(await frameCount(page)).toBe(0);
    // Still disarms, so a stray click does not leave the tool hanging.
    await expect(pointerBtn(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("paints below an uploaded image AND a Create node", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);                            // Create node: DOM, z 20
    await uploadImage(page, 600, 400, "harbour.png"); // raiseCanvas(): stage z 30
    const box = await imageBox(page);

    // Frame drawn last, so creation order cannot be what puts it behind.
    await frameBtn(page).click();
    await drawFrame(page, 300, 110, 1150, 640);
    expect(await frameCount(page)).toBe(1);

    const z = await page.evaluate(() => {
      const zOf = (e: HTMLElement | null) => {
        while (e) {
          const v = getComputedStyle(e).zIndex;
          if (v !== "auto") return Number(v);
          e = e.parentElement;
        }
        return NaN;
      };
      const canvases = Array.from(document.querySelectorAll("canvas"));
      const panel = document.querySelector("button.node-panel-placeholder") as HTMLElement | null;
      return {
        canvasZs: canvases.map((c) => zOf(c.closest("div") as HTMLElement)),
        panelZ: zOf(panel),
      };
    });

    // The frames stage is the lowest surface on the page, under the main
    // canvas in both its positions and under the placeholders between them.
    const frameZ = Math.min(...z.canvasZs);
    const boardZ = Math.max(...z.canvasZs);
    expect(frameZ).toBeLessThan(z.panelZ);
    expect(frameZ).toBeLessThan(boardZ);

    // And the image resting on it keeps its own chrome.
    await page.mouse.click(box.x + 40, box.y + 40);
    await page.waitForTimeout(400);
    await expect(page.locator('div[title="harbour"]')).toHaveCount(1);
  });

  test("dragging a frame carries the nodes inside it", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 600, 400, "harbour.png");
    const before = await imageBox(page);

    // A frame drawn comfortably around the image, so it is fully contained.
    await frameBtn(page).click();
    await drawFrame(page, before.x - 90, before.y - 90, before.x + before.w + 90, before.y + before.h + 90);

    // Grab the frame clear of the image and move it.
    const dx = 120, dy = 70;
    await page.mouse.move(before.x - 50, before.y - 50);
    await page.mouse.down();
    await page.mouse.move(before.x - 50 + dx, before.y - 50 + dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    // The image travelled with the frame, by the same amount.
    const after = await imageBox(page);
    expect(Math.round(after.x - before.x)).toBe(dx);
    expect(Math.round(after.y - before.y)).toBe(dy);
  });

  test("dragging a frame carries a Create node inside it", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    // addPanel leaves the panel expanded, and an open panel is a 320px DOM
    // element at Z_INDEX.nodes -- it would take the mousedown meant for the
    // frame beneath it.
    await collapsePanels(page);
    const before = (await panelBoxes(page))[0];

    await frameBtn(page).click();
    await drawFrame(page, before.x - 140, before.y - 140, before.x + before.w + 140, before.y + before.h + 140);

    // Grab bare frame to the LEFT of the panel, vertically centred: the
    // corners carry the transformer's resize anchors.
    const dx = 100, dy = 60;
    const gx = before.x - 70, gy = before.y + before.h / 2;
    await page.mouse.move(gx, gy);
    await page.mouse.down();
    await page.mouse.move(gx + dx, gy + dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = (await panelBoxes(page))[0];
    expect(Math.round(after.x - before.x)).toBe(dx);
    expect(Math.round(after.y - before.y)).toBe(dy);
  });

  test("a node outside the frame is left behind", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 600, 400, "harbour.png");
    const before = await imageBox(page);

    // Frame drawn well clear of the image: nothing is inside it.
    await frameBtn(page).click();
    await drawFrame(page, 60, 460, 330, 660);

    await page.mouse.move(120, 500);
    await page.mouse.down();
    await page.mouse.move(220, 560, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = await imageBox(page);
    expect(Math.round(after.x)).toBe(Math.round(before.x));
    expect(Math.round(after.y)).toBe(Math.round(before.y));
  });

  // The name is rendered from the store, but the rect is moved by Konva, so
  // without a live offset the label only caught up when the drag ended.
  test("the name keeps up with the frame mid-drag", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drawFrame(page, 400, 180, 760, 420);

    const labelX = async () =>
      (await page.locator('div[title="Frame"]').first().boundingBox())!.x;
    const start = await labelX();

    // Pause mid-gesture, with the button still down.
    await page.mouse.move(500, 300);
    await page.mouse.down();
    await page.mouse.move(650, 300, { steps: 10 });
    await page.waitForTimeout(150);
    const during = await labelX();
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Already moved with the frame, not parked at the old position.
    expect(during - start).toBeGreaterThan(100);
  });

  test("clicking empty board clears the frame selection", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drawFrame(page, 420, 180, 780, 420);

    const handles = () =>
      page.evaluate(() => {
        const st = (window as unknown as { Konva: { stages: { find(q: string): unknown[]; findOne(q: string): { nodes(): unknown[] } | undefined }[] } }).Konva.stages;
        const fs = st.find((s) => s.find(".frame").length);
        return fs?.findOne("Transformer")?.nodes().length ?? -1;
      });

    // Drawn, so selected.
    expect(await handles()).toBe(1);

    // Clear of the frame, on bare board.
    await page.mouse.click(1050, 620);
    await page.waitForTimeout(400);
    expect(await handles()).toBe(0);
  });

  // The hand is the PAN cursor. It used to appear the moment the drag began,
  // because mousedown read "not pointer" as "this tool pans" -- telling the
  // user the board was about to move while a rectangle was being drawn.
  test("the cursor stays a crosshair for the whole draw", async ({ page }) => {
    await openBoard(page);
    const cursor = () =>
      page.evaluate(() => {
        // Board's stage, not whichever canvas happens to be first in the DOM:
        // the frames stage appears mid-test and has its own container.
        const st = (window as unknown as { Konva: { stages: { container(): HTMLElement }[] } }).Konva.stages;
        return getComputedStyle(st[0].container()).cursor;
      });

    await frameBtn(page).click();
    await page.waitForTimeout(200);
    expect(await cursor()).toBe("crosshair");   // armed

    await page.mouse.move(420, 180);
    await page.mouse.down();
    await page.waitForTimeout(100);
    expect(await cursor()).toBe("crosshair");   // was "grabbing"

    await page.mouse.move(700, 380, { steps: 6 });
    await page.waitForTimeout(100);
    expect(await cursor()).toBe("crosshair");   // mid-drag

    await page.mouse.up();
    await page.waitForTimeout(300);
    // Disarmed after a successful draw, so back to the pointer's cursor.
    expect(await cursor()).toBe("default");
  });

  test("a misclick disarms cleanly, with no stale grab cursor", async ({ page }) => {
    await openBoard(page);
    const cursor = () =>
      page.evaluate(() => {
        // Board's stage, not whichever canvas happens to be first in the DOM:
        // the frames stage appears mid-test and has its own container.
        const st = (window as unknown as { Konva: { stages: { container(): HTMLElement }[] } }).Konva.stages;
        return getComputedStyle(st[0].container()).cursor;
      });

    await frameBtn(page).click();
    await page.mouse.move(500, 250);
    await page.mouse.down();
    await page.mouse.move(504, 253);
    await page.mouse.up();
    await page.waitForTimeout(300);
    // Too small to make a frame, so the tool disarms to pointer -- and the
    // cursor must follow it rather than being left on a stale "grabbing".
    expect(await cursor()).toBe("default");
  });

  test("a frame has no port of its own", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drawFrame(page, 450, 180, 800, 430);

    await page.mouse.click(600, 300);
    await page.waitForTimeout(400);
    // The frame is selected, but nothing wires to a backdrop.
    await expect(page.locator('div[title="Output"], div[title="Input"]')).toHaveCount(0);
  });
});
