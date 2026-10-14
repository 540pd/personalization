import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, imageBox, addPanel, panelBoxes, collapsePanels, setZoom } from "./helpers";

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

  // An open form sits above the whole board (#116), so a draw starting on it
  // would land on the form and draw nothing. Arming Frame ends the edit.
  test("arming Frame folds an open Create form so the draw reaches the board", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await expect(page.locator(".node-panel-create")).toHaveCount(1);

    await frameBtn(page).click();
    await expect(page.locator(".node-panel-create")).toHaveCount(0);
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

// Issue #107. Frames arrived with their own selection but only two of the
// paths that clear a selection knew about them, so a frame kept its handles
// while a node was selected -- and both Delete handlers are on window.
test.describe("one selection at a time", () => {
  /** Handle counts on each stage: the frame stage, and the board stage. */
  const handles = (page: Page) =>
    page.evaluate(() => {
      type S = { find(q: string): unknown[]; findOne(q: string): { nodes(): unknown[] } | undefined };
      const stages = (window as unknown as { Konva: { stages: S[] } }).Konva.stages;
      const fs = stages.find((st) => st.find(".frame").length);
      const bs = stages.find((st) => st !== fs);
      return {
        frame: fs?.findOne("Transformer")?.nodes().length ?? 0,
        node: bs?.findOne("Transformer")?.nodes().length ?? 0,
      };
    });

  /** An image, plus a frame drawn well clear of it, with the frame selected. */
  async function imageAndFrame(page: Page) {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await collapsePanels(page);
    const img = await imageBox(page);
    await frameBtn(page).click();
    await drawFrame(page, 340, 120, 600, 300);
    return img;
  }

  test("clicking a node clears the frame selection", async ({ page }) => {
    const img = await imageAndFrame(page);
    expect((await handles(page)).frame).toBe(1);

    await page.mouse.click(img.x + img.w / 2, img.y + img.h / 2);
    await page.waitForTimeout(400);

    const h = await handles(page);
    expect(h.node).toBe(1);
    expect(h.frame).toBe(0);
  });

  test("clicking a frame clears the node selection", async ({ page }) => {
    const img = await imageAndFrame(page);

    await page.mouse.click(img.x + img.w / 2, img.y + img.h / 2);
    await page.waitForTimeout(300);
    expect((await handles(page)).node).toBe(1);

    await page.mouse.click(470, 210);
    await page.waitForTimeout(400);

    const h = await handles(page);
    expect(h.frame).toBe(1);
    expect(h.node).toBe(0);
  });

  test("Escape clears the frame selection too", async ({ page }) => {
    await imageAndFrame(page);
    expect((await handles(page)).frame).toBe(1);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    expect((await handles(page)).frame).toBe(0);
  });

  test("Ctrl+A takes every frame, not just the nodes", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await collapsePanels(page);

    await frameBtn(page).click();
    await drawFrame(page, 340, 120, 600, 300);
    await frameBtn(page).click();
    await drawFrame(page, 900, 120, 1180, 300);
    expect(await frameCount(page)).toBe(2);

    await page.keyboard.press("Control+a");
    await page.waitForTimeout(400);

    const h = await handles(page);
    expect(h.frame).toBe(2);
    expect(h.node).toBe(1);
  });

  test("one Delete after Ctrl+A takes the frames, and one undo brings them back", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await collapsePanels(page);

    await frameBtn(page).click();
    await drawFrame(page, 340, 120, 600, 300);
    await frameBtn(page).click();
    await drawFrame(page, 900, 120, 1180, 300);

    await page.keyboard.press("Control+a");
    await page.waitForTimeout(300);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(500);
    expect(await frameCount(page)).toBe(0);

    // One step, not one per frame.
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(600);
    expect(await frameCount(page)).toBe(2);
  });
});

// Issue #117. Frames were styled on their own -- tighter corners, no hover
// cue, blue handles -- and read as a different kind of object from nodes.
test.describe("frames match nodes", () => {
  type Attrs = Record<string, unknown>;

  /** Attrs of the frame stage's and the board stage's transformers. */
  const transformers = (page: Page) =>
    page.evaluate(() => {
      type T = { getAttrs(): Record<string, unknown>; enabledAnchors(): string[] };
      type S = { find(q: string): unknown[]; findOne(q: string): T | undefined };
      const stages = (window as unknown as { Konva: { stages: S[] } }).Konva.stages;
      const fs = stages.find((st) => st.find(".frame").length);
      const bs = stages.find((st) => st !== fs);
      const pick = (t?: T): Record<string, unknown> | null =>
        t ? { ...t.getAttrs(), anchors: t.enabledAnchors().length } : null;
      return { frame: pick(fs?.findOne("Transformer")), node: pick(bs?.findOne("Transformer")) };
    });

  /** The frame rect's own attrs, and whether its hover outline is showing. */
  const frameState = (page: Page) =>
    page.evaluate(() => {
      type N = {
        getAttrs(): Record<string, unknown>;
        visible(): boolean;
        getClientRect(): { x: number; y: number; width: number; height: number };
      };
      type S = { find(q: string): N[]; findOne(q: string): N | undefined };
      const fs = (window as unknown as { Konva: { stages: S[] } }).Konva.stages.find((st) => st.find(".frame").length);
      const rect = fs?.find(".frame")[0];
      return {
        cornerRadius: rect?.getAttrs().cornerRadius,
        box: rect?.getClientRect(),
        hover: !!fs?.findOne(".hover-outline")?.visible(),
      };
    });

  const nodeCornerRadius = (page: Page) =>
    page.evaluate(() => {
      type S = { findOne(q: string): { getAttrs(): Record<string, unknown> } | undefined };
      return (window as unknown as { Konva: { stages: S[] } }).Konva.stages[0].findOne("Image")?.getAttrs().cornerRadius;
    });

  /**
   * Draw a frame around a box without crossing the node's name label, which
   * sits just above its top-left corner and cancels a draw that passes over
   * it (a separate frame-tool bug). Down the left side, then along the bottom.
   */
  async function drawAround(page: Page, img: { x: number; y: number; w: number; h: number }, pad = 90) {
    const x1 = img.x - pad, y1 = img.y - pad, x2 = img.x + img.w + pad, y2 = img.y + img.h + pad;
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x1, y2, { steps: 6 });
    await page.mouse.move(x2, y2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }

  test("corners round like a node", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await collapsePanels(page);
    await frameBtn(page).click();
    await drawFrame(page, 340, 120, 640, 320);

    expect((await frameState(page)).cornerRadius).toBe(await nodeCornerRadius(page));
  });

  test("hovering bare frame shows the node hover outline", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drawFrame(page, 340, 120, 640, 320);
    // Drawn, so selected; deselect so the hover cue is allowed to show.
    await page.mouse.click(1050, 620);
    await page.waitForTimeout(300);

    await page.mouse.move(360, 140);
    await page.waitForTimeout(200);
    expect((await frameState(page)).hover).toBe(true);

    // And it goes when the pointer leaves for empty board.
    await page.mouse.move(1050, 620);
    await page.waitForTimeout(200);
    expect((await frameState(page)).hover).toBe(false);
  });

  // The case a mouseleave-driven outline gets wrong: Board takes the pointer
  // back over a node, so the frame stage never hears the pointer leave.
  test("over a node inside a frame, only the node is outlined", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await collapsePanels(page);
    const img = await imageBox(page);
    await frameBtn(page).click();
    await drawAround(page, img);
    await page.mouse.click(1050, 620);
    await page.waitForTimeout(300);

    await page.mouse.move(img.x - 60, img.y - 60);
    await page.waitForTimeout(200);
    expect((await frameState(page)).hover).toBe(true);

    await page.mouse.move(img.x + img.w / 2, img.y + img.h / 2, { steps: 6 });
    await page.waitForTimeout(200);
    expect((await frameState(page)).hover).toBe(false);
  });

  test("no hover outline on a selected frame, its handles already say so", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drawFrame(page, 340, 120, 640, 320);

    await page.mouse.move(360, 140);
    await page.waitForTimeout(200);
    expect((await frameState(page)).hover).toBe(false);
  });

  test("a selected frame has the same border and handles as a node", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await collapsePanels(page);
    await frameBtn(page).click();
    await drawFrame(page, 340, 120, 640, 320);

    const { frame, node } = await transformers(page);
    const look = (a: Attrs | null) => a && {
      borderStroke: a.borderStroke,
      borderStrokeWidth: a.borderStrokeWidth,
      anchorStroke: a.anchorStroke,
      anchorFill: a.anchorFill,
      anchorSize: a.anchorSize,
      anchorCornerRadius: a.anchorCornerRadius,
      padding: a.padding,
    };
    expect(look(frame)).toEqual(look(node));
  });

  test("frames keep edge handles and resize freely", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drawFrame(page, 340, 120, 640, 320);

    const { frame } = await transformers(page);
    expect(frame?.anchors).toBe(8);
    expect(frame?.keepRatio).toBe(false);
    expect(frame?.flipEnabled).toBe(false);
  });

  /** Drag the selected frame's bottom-right handle by (dx, dy). */
  async function dragCorner(page: Page, dx: number, dy: number) {
    const a = await page.evaluate(() => {
      type N = { getClientRect(): { x: number; y: number; width: number; height: number } };
      type S = { find(q: string): unknown[]; findOne(q: string): N | undefined };
      const fs = (window as unknown as { Konva: { stages: S[] } }).Konva.stages.find((st) => st.find(".frame").length);
      const r = fs!.findOne(".bottom-right")!.getClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + dx, a.y + dy, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }

  // Crossing swaps the handle, as it does for a node: the box re-forms the
  // right way round on the far side, unrotated and with its scale baked in.
  // A frame's stored box has no rotation, so it must never be turned over.
  // (The original frame config was not seen to break this either; the check
  // is here to hold the node-parity setting, flipEnabled: false, in place.)
  test("dragging a handle past the opposite edge leaves a usable frame", async ({ page }) => {
    await openBoard(page);
    await frameBtn(page).click();
    await drawFrame(page, 340, 120, 640, 320);

    await dragCorner(page, -500, -350);

    const after = (await frameState(page)).box!;
    expect(after.width).toBeGreaterThanOrEqual(19);
    expect(after.height).toBeGreaterThanOrEqual(19);
    // Not turned over, and the scale baked back into the size.
    const shape = await page.evaluate(() => {
      type N = { rotation(): number; scaleX(): number; scaleY(): number };
      type S = { find(q: string): N[] };
      const fs = (window as unknown as { Konva: { stages: S[] } }).Konva.stages.find((st) => st.find(".frame").length);
      const r = fs!.find(".frame")[0];
      return { rotation: Math.round(r.rotation()), scaleX: r.scaleX(), scaleY: r.scaleY() };
    });
    expect(shape).toEqual({ rotation: 0, scaleX: 1, scaleY: 1 });
  });

  for (const level of [0.5, 1, 1.5]) {
    test(`cannot be shrunk below its minimum at ${level * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      if (level !== 1) await setZoom(page, level);
      await frameBtn(page).click();
      await drawFrame(page, 340, 120, 640, 320);
      const before = (await frameState(page)).box!;

      await dragCorner(page, -(before.width - 6), -(before.height - 6));

      const after = (await frameState(page)).box!;
      // FRAME_MIN_EDGE is 20 screen px.
      expect(after.width).toBeGreaterThanOrEqual(19);
      expect(after.height).toBeGreaterThanOrEqual(19);
    });
  }

  test("dragging by bare area still carries the contents", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await collapsePanels(page);
    const img = await imageBox(page);
    await frameBtn(page).click();
    await drawAround(page, img);

    await page.mouse.move(img.x - 60, img.y - 60);
    await page.mouse.down();
    await page.mouse.move(img.x - 60 + 80, img.y - 60 + 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = await imageBox(page);
    expect(Math.round(after.x - img.x)).toBe(80);
    expect(Math.round(after.y - img.y)).toBe(50);
  });
});
