import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, imageBox, addPanel, panelBoxes, collapsePanels, setZoom, makePng, reloadBoard } from "./helpers";

// Issue #119. A selected frame owns a drag that starts inside it: pressing on
// a node within it and dragging moves the frame and everything in it. A plain
// click still selects the node. The frame's name is a handle too.

type Box = { x: number; y: number; w: number; h: number };

const frameBtn = (page: Page) => page.getByRole("button", { name: "Frame", exact: true });

/**
 * Draw a frame around a box, corner to corner -- straight across the node's
 * name label, which no longer cancels the draw (#118).
 */
async function drawAround(page: Page, b: Box, pad = 90) {
  await frameBtn(page).click();
  await page.mouse.move(b.x - pad, b.y - pad);
  await page.mouse.down();
  await page.mouse.move(b.x + b.w + pad, b.y + b.h + pad, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

/** The frame's box, and how many frames and board nodes are selected. */
const state = (page: Page) =>
  page.evaluate(() => {
    type N = { getClientRect(): { x: number; y: number; width: number; height: number } };
    type S = { find(q: string): N[]; findOne(q: string): { nodes(): unknown[] } | undefined };
    const stages = (window as unknown as { Konva: { stages: S[] } }).Konva.stages;
    const fs = stages.find((st) => st.find(".frame").length);
    const bs = stages.find((st) => st !== fs);
    const r = fs?.find(".frame")[0]?.getClientRect();
    return {
      frame: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      framesSelected: fs?.findOne("Transformer")?.nodes().length ?? 0,
      nodesSelected: bs?.findOne("Transformer")?.nodes().length ?? 0,
    };
  });

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** An uploaded image with a frame drawn around it -- drawn, so selected. */
async function imageInFrame(page: Page) {
  await openBoard(page);
  await uploadImage(page, 200, 150);
  await collapsePanels(page);
  const img = await imageBox(page);
  await drawAround(page, img);
  return img;
}

test.describe("dragging a selected frame from inside it", () => {
  test("dragging an image inside a selected frame moves the whole frame", async ({ page }) => {
    const img = await imageInFrame(page);
    const before = await state(page);
    expect(before.framesSelected).toBe(1);

    await drag(page, centre(img), 80, 50);

    const after = await state(page);
    const moved = await imageBox(page);
    expect(Math.round(moved.x - img.x)).toBe(80);
    expect(Math.round(moved.y - img.y)).toBe(50);
    expect(Math.round(after.frame!.x - before.frame!.x)).toBe(80);
    expect(Math.round(after.frame!.y - before.frame!.y)).toBe(50);
    // The frame stays the selection; the image did not take it.
    expect(after.framesSelected).toBe(1);
    expect(after.nodesSelected).toBe(0);
  });

  test("dragging a Create node inside a selected frame moves the whole frame", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const [node] = await panelBoxes(page);
    await drawAround(page, node);
    const before = await state(page);

    await drag(page, centre(node), 70, 40);

    const [after] = await panelBoxes(page);
    expect(Math.round(after.x - node.x)).toBe(70);
    expect(Math.round(after.y - node.y)).toBe(40);
    const s = await state(page);
    expect(Math.round(s.frame!.x - before.frame!.x)).toBe(70);
    expect(Math.round(s.frame!.y - before.frame!.y)).toBe(40);
  });

  test("a plain click on an image inside a selected frame selects the image", async ({ page }) => {
    const img = await imageInFrame(page);
    const before = await state(page);

    await page.mouse.click(centre(img).x, centre(img).y);
    await page.waitForTimeout(400);

    const after = await state(page);
    expect(after.nodesSelected).toBe(1);
    expect(after.framesSelected).toBe(0);
    // And nothing moved.
    expect(Math.round(after.frame!.x)).toBe(Math.round(before.frame!.x));
  });

  test("with the frame not selected, dragging an image moves only the image", async ({ page }) => {
    const img = await imageInFrame(page);
    await page.mouse.click(1050, 620);
    await page.waitForTimeout(300);
    const before = await state(page);
    expect(before.framesSelected).toBe(0);

    await drag(page, centre(img), 40, 30);

    const moved = await imageBox(page);
    expect(Math.round(moved.x - img.x)).toBe(40);
    const after = await state(page);
    expect(Math.round(after.frame!.x)).toBe(Math.round(before.frame!.x));
    expect(Math.round(after.frame!.y)).toBe(Math.round(before.frame!.y));
  });

  test("one undo puts the frame and its contents back together", async ({ page }) => {
    const img = await imageInFrame(page);
    const before = await state(page);
    await drag(page, centre(img), 80, 50);

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(500);

    const back = await imageBox(page);
    expect(Math.round(back.x)).toBe(Math.round(img.x));
    expect(Math.round(back.y)).toBe(Math.round(img.y));
    const s = await state(page);
    expect(Math.round(s.frame!.x)).toBe(Math.round(before.frame!.x));
    expect(Math.round(s.frame!.y)).toBe(Math.round(before.frame!.y));
  });

  for (const level of [0.5, 1.5]) {
    test(`the frame and image move together at ${level * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, level);
      await uploadImage(page, 200, 150);
      await collapsePanels(page);
      const img = await imageBox(page);
      await drawAround(page, img, 60);
      const before = await state(page);

      await drag(page, centre(img), 60, 40);

      const moved = await imageBox(page);
      const after = await state(page);
      // Screen px, so the same offset at any zoom.
      expect(Math.round(moved.x - img.x)).toBe(60);
      expect(Math.round(after.frame!.x - before.frame!.x)).toBe(60);
    });
  }
});

test.describe("dragging a frame by its name", () => {
  const frameName = (page: Page) => page.locator('div[title="Frame"]');

  test("dragging the name moves the frame and its contents, and selects it", async ({ page }) => {
    const img = await imageInFrame(page);
    await page.mouse.click(1050, 620);
    await page.waitForTimeout(300);
    const before = await state(page);
    const label = (await frameName(page).boundingBox())!;

    await drag(page, { x: label.x + label.width / 2, y: label.y + label.height / 2 }, 90, 40);

    const after = await state(page);
    const moved = await imageBox(page);
    expect(Math.round(after.frame!.x - before.frame!.x)).toBe(90);
    expect(Math.round(moved.x - img.x)).toBe(90);
    expect(after.framesSelected).toBe(1);
    // The name went with it.
    const labelAfter = (await frameName(page).boundingBox())!;
    expect(Math.round(labelAfter.x - label.x)).toBe(90);
  });

  test("clicking the name selects the frame without moving it", async ({ page }) => {
    await imageInFrame(page);
    await page.mouse.click(1050, 620);
    await page.waitForTimeout(300);
    const before = await state(page);

    await frameName(page).click();
    await page.waitForTimeout(300);

    const after = await state(page);
    expect(after.framesSelected).toBe(1);
    expect(Math.round(after.frame!.x)).toBe(Math.round(before.frame!.x));
  });

  test("double-clicking the name still renames the frame", async ({ page }) => {
    await imageInFrame(page);

    await frameName(page).dblclick();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Hero shots");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    await expect(page.locator('div[title="Hero shots"]')).toHaveCount(1);
  });
});

// #131, found testing the above: what an image left behind, or added, when a
// selected frame took over its drag.
test.describe("a selected frame dragged from an image", () => {
  test("leaves no hover outline behind where an uploaded image used to be", async ({ page }) => {
    await imageInFrame(page);
    const img = await imageBox(page);
    // Hover first, so the outline is drawn round the image at its old place.
    await page.mouse.move(img.x + img.w / 2, img.y + img.h / 2);
    await page.waitForTimeout(200);
    await drag(page, centre(img), 150, 60);

    const outline = await page.evaluate(() => {
      type R = { isVisible(): boolean; getClientRect(): { x: number; y: number } };
      const st = (window as unknown as { Konva: { stages: { findOne(q: string): R | undefined }[] } }).Konva.stages[0];
      const o = st.findOne(".hover-outline");
      return o && o.isVisible() ? o.getClientRect() : null;
    });
    const moved = await imageBox(page);
    expect(Math.round(moved.x - img.x)).toBe(150);
    // Hidden, or at worst drawn round the image where it now is.
    if (outline) expect(Math.abs(outline.x - moved.x)).toBeLessThan(6);
  });

  for (const z of [0.5, 1.5]) {
    test(`at ${z * 100}% zoom the image and the frame move together, outline and all`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, z);
      await uploadImage(page, 200, 150);
      await collapsePanels(page);
      const img = await imageBox(page);
      await drawAround(page, img, 60);
      const before = await state(page);
      await page.mouse.move(img.x + img.w / 2, img.y + img.h / 2);
      await page.waitForTimeout(200);
      await drag(page, centre(img), 120, 40);

      const moved = await imageBox(page);
      expect(Math.round(moved.x - img.x)).toBe(120);
      expect(Math.round((await state(page)).frame!.x - before.frame!.x)).toBe(120);
      const outlineVisible = await page.evaluate(() => {
        type R = { isVisible(): boolean; getClientRect(): { x: number } };
        const st = (window as unknown as { Konva: { stages: { findOne(q: string): R | undefined }[] } }).Konva.stages[0];
        const o = st.findOne(".hover-outline");
        return o && o.isVisible() ? o.getClientRect().x : null;
      });
      if (outlineVisible !== null) expect(Math.abs(outlineVisible - moved.x)).toBeLessThan(6);
    });
  }

  test.describe("a generated image", () => {
    const IMG = `data:image/png;base64,${makePng(64, 36).toString("base64")}`;
    const konvaImages = (page: Page) =>
      page.evaluate(() => (window as unknown as { Konva: { stages: { find(q: string): unknown[] }[] } }).Konva.stages[0].find("Image").length);

    /** A Create node with a generated image, generation stubbed. */
    async function generated(page: Page) {
      await page.route("**/api/proxy/**", async (r) =>
        r.request().method() !== "POST"
          ? r.continue()
          : r.fulfill({ contentType: "application/json", body: JSON.stringify({ jobId: "j", status: "done", imageUrl: IMG, modelUsed: "m" }) })
      );
      await openBoard(page);
      await addPanel(page);
      await page.locator("textarea").first().fill("a red kite");
      await page.locator("button:has-text('Create')").first().click();
      await page.waitForTimeout(1500);
      await collapsePanels(page);
      await expect(page.locator("img.node-panel-preview")).toHaveCount(1);
      return (await panelBoxes(page))[0];
    }

    test("moves the whole selected frame and adds no image", async ({ page }) => {
      const node = await generated(page);
      await drawAround(page, node);
      const before = await state(page);
      expect(before.framesSelected).toBe(1);

      await drag(page, centre(node), 150, 60);
      const after = (await panelBoxes(page))[0];
      // A native image drag used to take the gesture over a few px in.
      expect(Math.round(after.x - node.x)).toBe(150);
      expect(Math.round((await state(page)).frame!.x - before.frame!.x)).toBe(150);
      expect(await konvaImages(page)).toBe(0);
      await expect(page.getByTestId("canvas-drop-overlay")).toHaveCount(0);
    });

    test("never starts a native browser drag, the source of the duplicate", async ({ page }) => {
      // Chrome hands a natively dragged <img> over as a file, which the
      // board's drop handler adds as a new image. Playwright cannot complete
      // an OS drag-and-drop, so this pins the cause directly.
      await generated(page);
      const prevented = await page.evaluate(() => {
        const img = document.querySelector("img.node-panel-preview")!;
        const ev = new DragEvent("dragstart", { bubbles: true, cancelable: true });
        img.dispatchEvent(ev);
        return ev.defaultPrevented;
      });
      expect(prevented).toBe(true);
    });

    test("with no frame, the node still drags on its own", async ({ page }) => {
      const node = await generated(page);
      await drag(page, centre(node), 150, 60);
      const after = (await panelBoxes(page))[0];
      expect(Math.round(after.x - node.x)).toBe(150);
      expect(await konvaImages(page)).toBe(0);
    });
  });
});

// Issue #155. Every pointermove of a Frame drag used to save the whole panel
// store -- image data URLs and all -- to localStorage, once per panel. The
// save is now deferred to the end of the gesture.
test.describe("a frame drag's cost", () => {
  /** Counts writes of the panel store, from the moment the page loads. */
  async function countPanelSaves(page: Page) {
    await page.addInitScript(() => {
      const w = window as unknown as { __panelSaves: number };
      w.__panelSaves = 0;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === "gcos-node-panels") w.__panelSaves++;
        return setItem.call(this, key, value);
      };
    });
  }
  const saves = (page: Page) =>
    page.evaluate(() => (window as unknown as { __panelSaves: number }).__panelSaves);

  /** A Create node with a frame drawn around it -- drawn, so selected. */
  async function panelInFrame(page: Page) {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const [node] = await panelBoxes(page);
    await drawAround(page, node);
    return node;
  }

  test("saves the panels once when the drag settles, not on every move", async ({ page }) => {
    await countPanelSaves(page);
    const node = await panelInFrame(page);
    await page.waitForTimeout(400);
    const before = await saves(page);

    const from = centre(node);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 120, from.y + 60, { steps: 30 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const [moved] = await panelBoxes(page);
    expect(Math.round(moved.x - node.x)).toBe(120);
    // 30 moves used to mean 30+ writes.
    expect((await saves(page)) - before).toBeLessThanOrEqual(2);
  });

  test("the dragged position survives a reload straight after the drop", async ({ page }) => {
    const node = await panelInFrame(page);
    const from = centre(node);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 120, from.y + 60, { steps: 12 });
    await page.mouse.up();
    const [moved] = await panelBoxes(page);

    // Inside the save delay: the pending write must not be lost with the page.
    await reloadBoard(page, { panels: 1 });

    const [after] = await panelBoxes(page);
    expect(Math.round(after.x)).toBe(Math.round(moved.x));
    expect(Math.round(after.y)).toBe(Math.round(moved.y));
  });
});
