import { test, expect, type Page } from "@playwright/test";
import { openBoard, setZoom, zoom, portCount, uploadImage, imageBox, collapsePanels } from "./helpers";

// Shapes v1, part 1: the Shapes menu and Rectangle. A shape is an ordinary
// selectable node on Board's layer, so most of these check that it really
// does ride the paths images already use.

/* eslint-disable @typescript-eslint/no-explicit-any */

const pointerBtn = (page: Page) => page.locator(".floating-dock button").nth(0);
// Pointer, Create, Links, Frame, then Shapes: the fifth button that carries
// aria-pressed.
const shapesBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(4);
const frameBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(3);
// Matched on the item's own label, exactly: a bare has-text('Arrow') also
// matches "Block Arrow".
const menuItem = (page: Page, label: string) =>
  page.locator(".floating-dock-submenu button").filter({
    has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
  });

interface ShapeInfo {
  kind: string;
  x: number; y: number; w: number; h: number;   // screen px
  cw: number; ch: number;                       // canvas units
  scaleX: number; scaleY: number;
  strokeWidth: number;
}

/** Every drawn shape on the board, in paint order, with its box on screen. */
const shapes = (page: Page): Promise<ShapeInfo[]> =>
  page.evaluate(() => {
    const s = (window as any).Konva.stages[0];
    const c = s.container().getBoundingClientRect();
    return s.find(".selectable")
      .filter((n: any) => n.getClassName() === "BoardShape")
      .map((n: any) => ({
        kind: n.getAttr("shapeKind"),
        x: c.left + s.x() + n.x() * s.scaleX(),
        y: c.top + s.y() + n.y() * s.scaleY(),
        w: n.width() * n.scaleX() * s.scaleX(),
        h: n.height() * n.scaleY() * s.scaleY(),
        cw: n.width() * n.scaleX(),
        ch: n.height() * n.scaleY(),
        scaleX: n.scaleX(),
        scaleY: n.scaleY(),
        strokeWidth: n.strokeWidth(),
      }));
  });

/** What the transformer has hold of. */
const selection = (page: Page) =>
  page.evaluate(() => {
    const tr = (window as any).Konva.stages[0].findOne("Transformer");
    return {
      count: tr.nodes().length,
      anchors: tr.enabledAnchors().length,
      kinds: tr.nodes().map((n: any) => n.getClassName()),
    };
  });

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number, shift = false) {
  await page.mouse.move(x1, y1);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  await page.waitForTimeout(300);
}

async function armRectangle(page: Page) {
  await shapesBtn(page).click();
  await menuItem(page, "Rectangle").click();
}

async function drawRect(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await armRectangle(page);
  await drag(page, x1, y1, x2, y2);
}

const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;

test.describe("shapes menu", () => {
  test("opens from the dock and lists Rectangle with its key, but no Doodle", async ({ page }) => {
    await openBoard(page);
    await shapesBtn(page).click();
    await expect(menuItem(page, "Rectangle")).toBeVisible();
    await expect(menuItem(page, "Rectangle")).toContainText("R");
    await expect(menuItem(page, "Doodle")).toHaveCount(0);
  });

  // The button opens the menu; it is not a shape itself, so its icon does
  // not change with what was drawn.
  test("the Shapes button keeps its own icon, and the menu marks the last shape", async ({ page }) => {
    await openBoard(page);
    await expect(shapesBtn(page).locator("svg.lucide-shapes")).toHaveCount(1);
    await armRectangle(page);
    await expect(shapesBtn(page).locator("svg.lucide-shapes")).toHaveCount(1);
    await page.keyboard.press("v");
    await shapesBtn(page).click();
    await expect(menuItem(page, "Rectangle")).toHaveClass(/floating-dock-submenu-item-active/);
  });

  test("picking Rectangle arms it: the button lights and the cursor is a crosshair", async ({ page }) => {
    await openBoard(page);
    await armRectangle(page);
    await expect(menuItem(page, "Rectangle")).toHaveCount(0);   // menu closed
    await expect(shapesBtn(page)).toHaveAttribute("aria-pressed", "true");
    await expect(pointerBtn(page)).toHaveAttribute("aria-pressed", "false");
    const cursor = await page.evaluate(() => (window as any).Konva.stages[0].container().style.cursor);
    expect(cursor).toBe("crosshair");
  });

  test("R arms Rectangle and S re-arms the last shape", async ({ page }) => {
    await openBoard(page);
    await page.mouse.click(900, 150);
    await page.keyboard.press("r");
    await expect(shapesBtn(page)).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("v");
    await expect(shapesBtn(page)).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("s");
    await expect(shapesBtn(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("Ctrl+R / Ctrl+S do not arm a shape", async ({ page }) => {
    await openBoard(page);
    await page.mouse.click(900, 150);
    // Ctrl+S would open the browser's save dialog if not prevented; the page
    // has no handler for it, so only the tool state is checked.
    await page.keyboard.down("Control");
    await page.keyboard.press("s");
    await page.keyboard.up("Control");
    await expect(shapesBtn(page)).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("drawing a rectangle", () => {
  test("a drag draws it from press to release, selected, and returns to pointer", async ({ page }) => {
    await openBoard(page);
    await drawRect(page, 400, 300, 560, 420);

    const [r] = await shapes(page);
    expect(r.kind).toBe("rect");
    expect(near(r.x, 400) && near(r.y, 300)).toBe(true);
    expect(near(r.w, 160) && near(r.h, 120)).toBe(true);

    const sel = await selection(page);
    expect(sel).toEqual({ count: 1, anchors: 8, kinds: ["BoardShape"] });
    await expect(pointerBtn(page)).toHaveAttribute("aria-pressed", "true");
    await expect(shapesBtn(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("dragging up and to the left works", async ({ page }) => {
    await openBoard(page);
    await drawRect(page, 560, 420, 400, 300);
    const [r] = await shapes(page);
    expect(near(r.x, 400) && near(r.y, 300) && near(r.w, 160) && near(r.h, 120)).toBe(true);
  });

  test("Shift makes it a square, still growing toward the pointer", async ({ page }) => {
    await openBoard(page);
    await armRectangle(page);
    await drag(page, 560, 420, 400, 360, true);
    const [r] = await shapes(page);
    // The longer side wins, and the square ends under the pointer's x.
    expect(near(r.w, 160) && near(r.h, 160)).toBe(true);
    expect(near(r.x, 400) && near(r.y, 260)).toBe(true);
  });

  test("a click places a 100x100 rectangle centred on it", async ({ page }) => {
    await openBoard(page);
    await armRectangle(page);
    await page.mouse.click(500, 350);
    await page.waitForTimeout(300);
    const all = await shapes(page);
    expect(all).toHaveLength(1);
    const [r] = all;
    expect(near(r.cw, 100) && near(r.ch, 100)).toBe(true);
    expect(near(r.x + r.w / 2, 500) && near(r.y + r.h / 2, 350)).toBe(true);
    // The click that placed it did not also deselect it.
    expect((await selection(page)).count).toBe(1);
  });

  test("Escape mid-draw abandons it", async ({ page }) => {
    await openBoard(page);
    await armRectangle(page);
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(500, 380, { steps: 4 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await shapes(page)).toHaveLength(0);
  });

  // The draw follows window pointer events, as the frame draw does (#118),
  // so crossing a name label -- DOM above the canvas -- does not cut it short.
  test("a draw straight across an image's name still completes", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 200, 150);
    await collapsePanels(page);
    const img = await imageBox(page);
    const label = await page.locator('div[title="photo"]').boundingBox();
    if (!label) throw new Error("image name label not found");

    await armRectangle(page);
    await page.mouse.move(img.x - 60, label.y - 40);
    await page.mouse.down();
    await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2, { steps: 6 });
    await page.mouse.move(img.x + img.w + 60, img.y + img.h + 60, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const [r] = await shapes(page);
    expect(near(r.x, img.x - 60) && near(r.x + r.w, img.x + img.w + 60)).toBe(true);
  });

  test("has no output port", async ({ page }) => {
    await openBoard(page);
    await drawRect(page, 400, 300, 560, 420);
    expect(await portCount(page)).toBe(0);
  });

  for (const z of [0.5, 1.5]) {
    test(`draws under the pointer at ${z * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, z);
      // setZoom lands within a wheel notch of the target, so divide by what
      // it actually reached.
      const actual = await zoom(page);
      await drawRect(page, 300, 200, 420, 290);
      const [r] = await shapes(page);
      expect(near(r.x, 300) && near(r.y, 200) && near(r.w, 120) && near(r.h, 90)).toBe(true);
      // Stored in canvas units, so zoom divides the drag.
      expect(near(r.cw, 120 / actual, 3) && near(r.ch, 90 / actual, 3)).toBe(true);
    });
  }
});

test.describe("editing a rectangle", () => {
  test("resizing stores the new size, so the stroke does not thicken", async ({ page }) => {
    await openBoard(page);
    await drawRect(page, 400, 300, 500, 380);
    // Bottom-right handle, outward.
    await drag(page, 500, 380, 600, 500);
    const [r] = await shapes(page);
    expect(r.scaleX).toBe(1);
    expect(r.scaleY).toBe(1);
    expect(r.strokeWidth).toBe(2);
    // Free resize: the ratio was not held.
    expect(near(r.w, 200, 4) && near(r.h, 200, 4)).toBe(true);
  });

  test("a side handle stretches one dimension only", async ({ page }) => {
    await openBoard(page);
    await drawRect(page, 400, 300, 500, 380);
    // middle-right handle
    await drag(page, 500, 340, 580, 340);
    const [r] = await shapes(page);
    expect(near(r.w, 180, 4)).toBe(true);
    expect(near(r.h, 80, 2)).toBe(true);
  });

  test("drags, and the move is one undo step", async ({ page }) => {
    await openBoard(page);
    await drawRect(page, 400, 300, 500, 380);
    await drag(page, 450, 340, 650, 440);
    let [r] = await shapes(page);
    expect(near(r.x, 600) && near(r.y, 400)).toBe(true);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(250);
    [r] = await shapes(page);
    expect(near(r.x, 400) && near(r.y, 300)).toBe(true);
  });

  test("dragging it brings it in front of an image", async ({ page }) => {
    await openBoard(page);
    await drawRect(page, 300, 200, 400, 280);
    await uploadImage(page, 200, 150);        // lands on top, mid-viewport
    await collapsePanels(page);
    const kindOnTop = () =>
      page.evaluate(() => {
        const nodes = (window as any).Konva.stages[0].find(".selectable");
        return nodes[nodes.length - 1].getClassName();
      });
    expect(await kindOnTop()).toBe("Image");
    await drag(page, 350, 240, 380, 260);
    expect(await kindOnTop()).toBe("BoardShape");
  });

  test("draw, delete, undo and redo", async ({ page }) => {
    await openBoard(page);
    await drawRect(page, 400, 300, 500, 380);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(250);
    expect(await shapes(page)).toHaveLength(0);

    await page.keyboard.press("Control+z");     // undo the delete
    await page.waitForTimeout(250);
    expect(await shapes(page)).toHaveLength(1);
    await page.keyboard.press("Control+z");     // undo the draw
    await page.waitForTimeout(250);
    expect(await shapes(page)).toHaveLength(0);
    await page.keyboard.press("Control+y");     // redo the draw
    await page.waitForTimeout(250);
    expect(await shapes(page)).toHaveLength(1);
  });

  test("copy and paste makes another rectangle, offset", async ({ page }) => {
    await openBoard(page);
    await drawRect(page, 400, 300, 500, 380);
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(300);
    const all = await shapes(page);
    expect(all).toHaveLength(2);
    expect(all[1].kind).toBe("rect");
    expect(near(all[1].x - all[0].x, 20) && near(all[1].w, all[0].w)).toBe(true);
    // The paste has no port either.
    expect(await portCount(page)).toBe(0);
  });

  // Escape rather than a click on empty board: once the canvas has been
  // raised, that click never reaches the stage (#105, fixed by #132).
  test("Ctrl+A selects it, and Escape clears it", async ({ page }) => {
    await openBoard(page);
    await drawRect(page, 400, 300, 500, 380);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    expect((await selection(page)).count).toBe(0);
    await page.keyboard.press("Control+a");
    await page.waitForTimeout(250);
    expect((await selection(page)).count).toBe(1);
  });

  test("moves with a Frame it sits inside", async ({ page }) => {
    await openBoard(page);
    await drawRect(page, 450, 300, 550, 380);
    await frameBtn(page).click();
    await drag(page, 380, 230, 640, 460);

    // The frame is selected after its draw; grab it clear of the rectangle.
    await drag(page, 400, 250, 520, 320);
    const [r] = await shapes(page);
    expect(near(r.x, 570) && near(r.y, 370)).toBe(true);
  });
});

// Part 2: Ellipse, Triangle and Diamond. Each fills the box it was dragged
// in, and is hit-tested on its own outline rather than that box.
test.describe("ellipse, triangle and diamond", () => {
  test("the menu lists the shapes in the reference order, with their keys", async ({ page }) => {
    await openBoard(page);
    await shapesBtn(page).click();
    const labels = await page.locator(".floating-dock-submenu button").allInnerTexts();
    expect(labels.map((l) => l.replace(/\s+/g, " ").trim())).toEqual([
      "Rectangle R", "Arrow A", "Line L", "Ellipse O", "Triangle", "Block Arrow", "Diamond",
    ]);
  });

  test("O arms Ellipse", async ({ page }) => {
    await openBoard(page);
    await page.mouse.click(900, 150);
    await page.keyboard.press("o");
    await page.keyboard.press("s");             // S re-arms the same one
    await drag(page, 400, 300, 560, 420);
    expect((await shapes(page))[0].kind).toBe("ellipse");
  });

  for (const [label, kind] of [["Ellipse", "ellipse"], ["Triangle", "triangle"], ["Diamond", "diamond"]]) {
    test(`${label} fills a wide drag without being forced equal-sided`, async ({ page }) => {
      await openBoard(page);
      await shapesBtn(page).click();
      await menuItem(page, label).click();
      await drag(page, 400, 300, 640, 400);
      const [r] = await shapes(page);
      expect(r.kind).toBe(kind);
      expect(near(r.w, 240) && near(r.h, 100)).toBe(true);
      expect((await selection(page)).anchors).toBe(8);
    });

    // Hit-testing follows paint: the corner of the box is outside every one
    // of these shapes.
    test(`${label} is selected from its middle but not from its box's corner`, async ({ page }) => {
      await openBoard(page);
      await shapesBtn(page).click();
      await menuItem(page, label).click();
      await drag(page, 400, 300, 560, 420);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);

      await page.mouse.move(405, 305);
      await page.mouse.click(405, 305);
      await page.waitForTimeout(250);
      expect((await selection(page)).count).toBe(0);

      await page.mouse.move(480, 380);
      await page.mouse.click(480, 380);
      await page.waitForTimeout(250);
      expect((await selection(page)).count).toBe(1);
    });
  }

  test("Shift draws a circle", async ({ page }) => {
    await openBoard(page);
    await shapesBtn(page).click();
    await menuItem(page, "Ellipse").click();
    await drag(page, 400, 300, 560, 360, true);
    const [r] = await shapes(page);
    expect(near(r.w, 160) && near(r.h, 160)).toBe(true);
  });

  test("the menu marks the last shape used, and the button icon stays", async ({ page }) => {
    await openBoard(page);
    await shapesBtn(page).click();
    await menuItem(page, "Ellipse").click();
    await page.keyboard.press("v");
    await shapesBtn(page).click();
    // Still the ellipse once disarmed: it is what S would bring back.
    await expect(menuItem(page, "Ellipse")).toHaveClass(/floating-dock-submenu-item-active/);
    await expect(menuItem(page, "Rectangle")).not.toHaveClass(/floating-dock-submenu-item-active/);
    await expect(shapesBtn(page).locator("svg.lucide-shapes")).toHaveCount(1);
  });

  test("a pasted diamond is still a diamond", async ({ page }) => {
    await openBoard(page);
    await shapesBtn(page).click();
    await menuItem(page, "Diamond").click();
    await drag(page, 400, 300, 520, 380);
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(300);
    expect((await shapes(page)).map((r) => r.kind)).toEqual(["diamond", "diamond"]);
  });
});

// Part 3: Line and Arrow. Drawn end to end rather than as a box, edited by a
// handle at each end, and clickable a few px either side of the stroke.
interface LineInfo { a: { x: number; y: number }; b: { x: number; y: number }; kind: string }

/** Each line's two ends on screen, start (a) then end (b). */
const lines = (page: Page): Promise<LineInfo[]> =>
  page.evaluate(() => {
    const s = (window as any).Konva.stages[0];
    const c = s.container().getBoundingClientRect();
    const scr = (x: number, y: number) => ({
      x: c.left + s.x() + x * s.scaleX(),
      y: c.top + s.y() + y * s.scaleY(),
    });
    return s.find(".selectable")
      .filter((n: any) => ["line", "arrow"].includes(n.getAttr("shapeKind")))
      .map((n: any) => {
        const [ax, ay, bx, by] = n.getAttr("linePoints");
        return {
          kind: n.getAttr("shapeKind"),
          a: scr(n.x() + ax, n.y() + ay),
          b: scr(n.x() + bx, n.y() + by),
        };
      });
  });

const nearPt = (p: { x: number; y: number }, x: number, y: number, tol = 2) =>
  near(p.x, x, tol) && near(p.y, y, tol);

async function arm(page: Page, label: string) {
  await shapesBtn(page).click();
  await menuItem(page, label).click();
}

test.describe("line and arrow", () => {
  test("A arms Arrow and L arms Line", async ({ page }) => {
    await openBoard(page);
    await page.mouse.click(900, 150);
    await page.keyboard.press("a");
    await drag(page, 300, 300, 400, 250);
    await page.keyboard.press("l");
    await drag(page, 300, 400, 400, 450);
    expect((await lines(page)).map((l) => l.kind)).toEqual(["arrow", "line"]);
  });

  test("an arrow runs from the press to the release, either way round", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Arrow");
    await drag(page, 560, 420, 400, 300);
    const [l] = await lines(page);
    expect(nearPt(l.a, 560, 420) && nearPt(l.b, 400, 300)).toBe(true);
  });

  test("Shift snaps the angle to 45 degrees", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Line");
    await drag(page, 400, 300, 600, 320, true);
    const [l] = await lines(page);
    expect(near(l.a.y, l.b.y, 1)).toBe(true);    // horizontal
  });

  test("a click places a horizontal line of the default length", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Line");
    await page.mouse.click(400, 300);
    await page.waitForTimeout(300);
    const [l] = await lines(page);
    expect(nearPt(l.a, 400, 300) && nearPt(l.b, 500, 300)).toBe(true);
  });

  test("a selected line shows a handle at each end and no resize box", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Line");
    await drag(page, 400, 300, 560, 420);
    const a = await page.getByTestId("line-handle-a").boundingBox();
    const b = await page.getByTestId("line-handle-b").boundingBox();
    expect(a && nearPt({ x: a.x + a.width / 2, y: a.y + a.height / 2 }, 400, 300)).toBe(true);
    expect(b && nearPt({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, 560, 420)).toBe(true);
    const tr = await page.evaluate(() => {
      const t = (window as any).Konva.stages[0].findOne("Transformer");
      return { border: t.borderEnabled(), resize: t.resizeEnabled() };
    });
    expect(tr).toEqual({ border: false, resize: false });
  });

  test("dragging a handle moves that end only, and is one undo step", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Arrow");
    await drag(page, 400, 300, 560, 420);
    await drag(page, 560, 420, 650, 300);
    let [l] = await lines(page);
    expect(nearPt(l.a, 400, 300) && nearPt(l.b, 650, 300)).toBe(true);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(250);
    [l] = await lines(page);
    expect(nearPt(l.b, 560, 420)).toBe(true);
  });

  test("Shift on a handle snaps that end around the other", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Line");
    await drag(page, 400, 300, 560, 420);
    await drag(page, 560, 420, 600, 290, true);
    const [l] = await lines(page);
    expect(near(l.a.y, l.b.y, 1)).toBe(true);
    expect(nearPt(l.a, 400, 300)).toBe(true);
  });

  test("dragging the line itself moves both ends", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Line");
    await drag(page, 400, 300, 560, 300);
    // Off-centre: the middle of a selected line is its bend handle.
    await drag(page, 440, 300, 490, 380);
    const [l] = await lines(page);
    expect(nearPt(l.a, 450, 380) && nearPt(l.b, 610, 380)).toBe(true);
  });

  for (const z of [0.5, 1.5]) {
    test(`is clickable 4px off the stroke at ${z * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, z);
      await arm(page, "Line");
      await drag(page, 300, 200, 460, 200);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      expect((await selection(page)).count).toBe(0);
      await page.mouse.move(380, 204);
      await page.mouse.click(380, 204);
      await page.waitForTimeout(250);
      expect((await selection(page)).count).toBe(1);
    });
  }

  test("is not clickable well clear of the stroke", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Line");
    await drag(page, 300, 200, 460, 280);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    // Inside the line's box but 40px off the diagonal.
    await page.mouse.move(420, 220);
    await page.mouse.click(420, 220);
    await page.waitForTimeout(250);
    expect((await selection(page)).count).toBe(0);
  });

  test("has no port, and pastes as the same kind", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Arrow");
    await drag(page, 400, 300, 560, 380);
    expect(await portCount(page)).toBe(0);
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(300);
    expect((await lines(page)).map((l) => l.kind)).toEqual(["arrow", "arrow"]);
  });

  test("moves with a Frame when both ends are inside it", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Line");
    await drag(page, 450, 300, 550, 380);
    await frameBtn(page).click();
    await drag(page, 380, 230, 640, 460);
    await drag(page, 400, 250, 520, 320);
    const [l] = await lines(page);
    expect(nearPt(l.a, 570, 370) && nearPt(l.b, 670, 450)).toBe(true);

    // Its end handles moved too, rather than staying where the frame found it.
    await page.mouse.click(595, 390);
    await page.waitForTimeout(250);
    const a = await page.getByTestId("line-handle-a").boundingBox();
    const b = await page.getByTestId("line-handle-b").boundingBox();
    expect(a && nearPt({ x: a.x + a.width / 2, y: a.y + a.height / 2 }, 570, 370)).toBe(true);
    expect(b && nearPt({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, 670, 450)).toBe(true);
  });
});

// Part 4: bending a line or arrow with its middle handle.
const bendOf = (page: Page) =>
  page.evaluate(() => {
    const n = (window as any).Konva.stages[0].find(".selectable")
      .find((x: any) => ["line", "arrow"].includes(x.getAttr("shapeKind")));
    return n.getAttr("bend") ?? 0;
  });

const handleCentre = async (page: Page, which: "a" | "b" | "bend") => {
  const r = await page.getByTestId(`line-handle-${which}`).boundingBox();
  if (!r) throw new Error(`no ${which} handle`);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

/** A straight horizontal line from (400, 300) to (600, 300), selected. */
async function straightLine(page: Page, label = "Line") {
  await arm(page, label);
  await drag(page, 400, 300, 600, 300);
}

test.describe("bending a line", () => {
  test("a selected line has a bend handle at its middle", async ({ page }) => {
    await openBoard(page);
    await straightLine(page);
    expect(nearPt(await handleCentre(page, "bend"), 500, 300)).toBe(true);
  });

  test("dragging the handle bends the line through it", async ({ page }) => {
    await openBoard(page);
    await straightLine(page);
    await drag(page, 500, 300, 500, 240);
    expect(near(await bendOf(page), 60, 1)).toBe(true);
    // The handle stays on the curve, at its midpoint.
    expect(nearPt(await handleCentre(page, "bend"), 500, 240)).toBe(true);
    // The box holds the bulge.
    const [r] = await shapes(page);
    expect(near(r.y, 240) && near(r.h, 60)).toBe(true);
  });

  test("the curve is clickable and the old chord is not", async ({ page }) => {
    await openBoard(page);
    await straightLine(page);
    await drag(page, 500, 300, 500, 220);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await page.mouse.move(500, 300);
    await page.mouse.click(500, 300);              // where the line used to run
    await page.waitForTimeout(250);
    expect((await selection(page)).count).toBe(0);

    await page.mouse.move(500, 222);
    await page.mouse.click(500, 222);              // the top of the curve
    await page.waitForTimeout(250);
    expect((await selection(page)).count).toBe(1);
  });

  test("sliding the handle along the line does not bend it", async ({ page }) => {
    await openBoard(page);
    await straightLine(page);
    await drag(page, 500, 300, 560, 300);
    expect(await bendOf(page)).toBe(0);
  });

  test("dragging back near straight snaps straight", async ({ page }) => {
    await openBoard(page);
    await straightLine(page);
    await drag(page, 500, 300, 500, 250);
    await drag(page, 500, 250, 500, 298);
    expect(await bendOf(page)).toBe(0);
  });

  test("double-clicking the handle straightens it, as one undo step", async ({ page }) => {
    await openBoard(page);
    await straightLine(page);
    await drag(page, 500, 300, 500, 250);
    const h = await handleCentre(page, "bend");
    await page.mouse.dblclick(h.x, h.y);
    await page.waitForTimeout(250);
    expect(await bendOf(page)).toBe(0);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(250);
    expect(near(await bendOf(page), 50, 1)).toBe(true);
  });

  test("moving an end keeps the bend", async ({ page }) => {
    await openBoard(page);
    await straightLine(page);
    await drag(page, 500, 300, 500, 250);
    await drag(page, 600, 300, 700, 300);
    expect(near(await bendOf(page), 50, 1)).toBe(true);
    const [l] = await lines(page);
    expect(nearPt(l.b, 700, 300)).toBe(true);
  });

  test("an arrow bends the same way, and a bend survives copy and paste", async ({ page }) => {
    await openBoard(page);
    await straightLine(page, "Arrow");
    await drag(page, 500, 300, 500, 360);
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(300);
    const bends = await page.evaluate(() =>
      (window as any).Konva.stages[0].find(".selectable").map((n: any) => Math.round(n.getAttr("bend")))
    );
    expect(bends).toEqual([-60, -60]);
  });

  test("a Frame around the chord but not the bulge leaves the line behind", async ({ page }) => {
    await openBoard(page);
    await straightLine(page);
    await drag(page, 500, 300, 500, 160);           // bulges up to y=160
    await frameBtn(page).click();
    await drag(page, 360, 230, 640, 400);           // holds the ends, not the top
    await drag(page, 380, 380, 480, 420);
    const [l] = await lines(page);
    expect(nearPt(l.a, 400, 300)).toBe(true);
  });

  // #157: the handles of a curved line inside a moved Frame stayed where the
  // line had been, until the line itself was moved.
  for (const label of ["Line", "Arrow"]) {
    test(`a curved ${label}'s handles follow its Frame, through undo and redo`, async ({ page }) => {
      await openBoard(page);
      await straightLine(page, label);
      await drag(page, 500, 300, 500, 250);          // bulges up to y=250
      await frameBtn(page).click();
      await drag(page, 360, 200, 640, 360);

      /** Selects the line from the top of its curve, then reads its handles. */
      const handlesAfterClick = async (x: number, y: number) => {
        await page.mouse.click(x, y + 2);
        await page.waitForTimeout(250);
        return {
          a: await handleCentre(page, "a"),
          b: await handleCentre(page, "b"),
          bend: await handleCentre(page, "bend"),
        };
      };
      const expectHandles = (h: Awaited<ReturnType<typeof handlesAfterClick>>, dx: number, dy: number) => {
        expect(nearPt(h.a, 400 + dx, 300 + dy)).toBe(true);
        expect(nearPt(h.b, 600 + dx, 300 + dy)).toBe(true);
        expect(nearPt(h.bend, 500 + dx, 250 + dy)).toBe(true);
      };

      // Two moves, one across and one down, each from the Frame's bare area.
      await drag(page, 380, 340, 480, 340);
      expectHandles(await handlesAfterClick(600, 250), 100, 0);
      await drag(page, 480, 340, 480, 400);
      expectHandles(await handlesAfterClick(600, 310), 100, 60);

      await page.keyboard.press("Control+z");
      await page.waitForTimeout(250);
      expectHandles(await handlesAfterClick(600, 250), 100, 0);

      await page.keyboard.press("Control+y");
      await page.waitForTimeout(250);
      expectHandles(await handlesAfterClick(600, 310), 100, 60);
    });
  }

  for (const z of [0.5, 1.5]) {
    test(`a curved line's handles follow its Frame at ${z * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, z);
      await straightLine(page);
      await drag(page, 500, 300, 500, 250);
      const before = { a: await handleCentre(page, "a"), bend: await handleCentre(page, "bend") };
      await frameBtn(page).click();
      // The bulge is 50 screen px whatever the zoom, so this box holds it.
      await drag(page, 360, 200, 640, 360);
      await drag(page, 380, 340, 460, 380);          // 80 across, 40 down, on screen
      await page.mouse.click(before.bend.x + 80, before.bend.y + 42);
      await page.waitForTimeout(250);
      expect(nearPt(await handleCentre(page, "a"), before.a.x + 80, before.a.y + 40)).toBe(true);
      expect(nearPt(await handleCentre(page, "bend"), before.bend.x + 80, before.bend.y + 40)).toBe(true);
    });
  }

  for (const z of [0.5, 1.5]) {
    test(`bends under the pointer at ${z * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, z);
      await straightLine(page);
      await drag(page, 500, 300, 500, 250);
      expect(nearPt(await handleCentre(page, "bend"), 500, 250)).toBe(true);
    });
  }
});

// Part 5: Block Arrow. A box shape like Triangle and Diamond, pointing the
// way it was dragged.
const pointingOfFirst = (page: Page) =>
  page.evaluate(() =>
    (window as any).Konva.stages[0].find(".selectable")
      .map((n: any) => n.getAttr("pointing"))
  );

/** Is the shape under (x, y)? Deselects first, then clicks there. */
async function hits(page: Page, x: number, y: number) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await page.waitForTimeout(250);
  return (await selection(page)).count === 1;
}

test.describe("block arrow", () => {
  for (const [dir, from, to] of [
    ["right", [400, 300], [640, 400]],
    ["left", [640, 300], [400, 400]],
    ["down", [400, 300], [500, 540]],
    ["up", [400, 540], [500, 300]],
  ] as const) {
    test(`points ${dir} when dragged ${dir}`, async ({ page }) => {
      await openBoard(page);
      await arm(page, "Block Arrow");
      await drag(page, from[0], from[1], to[0], to[1]);
      expect(await pointingOfFirst(page)).toEqual([dir]);
      const [r] = await shapes(page);
      expect(r.kind).toBe("blockArrow");
      expect((await selection(page)).anchors).toBe(8);
    });
  }

  test("a click places one pointing right", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Block Arrow");
    await page.mouse.click(500, 350);
    await page.waitForTimeout(300);
    expect(await pointingOfFirst(page)).toEqual(["right"]);
    const [r] = await shapes(page);
    expect(near(r.cw, 100) && near(r.ch, 100)).toBe(true);
  });

  // The box is 240x100, so the head is 100 long from x=540. Just inside the
  // head's top edge is outside the shaft, which is only half as thick.
  test("is hit-tested on its own outline, head on the side it points", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Block Arrow");
    await drag(page, 400, 300, 640, 400);
    expect(await hits(page, 548, 310)).toBe(true);     // in the head
    expect(await hits(page, 420, 310)).toBe(false);    // above the shaft
    expect(await hits(page, 420, 350)).toBe(true);     // in the shaft

    await page.keyboard.press("Delete");
    await arm(page, "Block Arrow");
    await drag(page, 640, 300, 400, 400);              // same box, pointing left
    await page.keyboard.press("Escape");
    expect(await hits(page, 548, 310)).toBe(false);    // now shaft side
  });

  test("keeps its direction through a resize and a paste", async ({ page }) => {
    await openBoard(page);
    await arm(page, "Block Arrow");
    await drag(page, 400, 300, 500, 500);              // down
    await drag(page, 500, 500, 560, 560);              // bottom-right handle
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(300);
    expect(await pointingOfFirst(page)).toEqual(["down", "down"]);
  });
});
