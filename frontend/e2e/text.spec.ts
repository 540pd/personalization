import { test, expect, type Page } from "@playwright/test";
import { openBoard, setZoom, zoom, portCount } from "./helpers";

// Text v1: the Text tool, editing in place, and text as a board node.

/* eslint-disable @typescript-eslint/no-explicit-any */

const pointerBtn = (page: Page) => page.getByRole("button", { name: "Select", exact: true });
// Pointer, Create, Links, Frame, Shapes, then Text.
const textBtn = (page: Page) => page.getByRole("button", { name: "Text", exact: true });
const frameBtn = (page: Page) => page.getByRole("button", { name: "Frame", exact: true });
const editor = (page: Page) => page.getByTestId("text-editor");

interface TextInfo {
  text: string;
  x: number; y: number; w: number; h: number;     // screen px
  fontSize: number; width: number; autoWidth: boolean;
  scaleX: number; visible: boolean;
}

/** Every text on the board, with its box on screen. */
const texts = (page: Page): Promise<TextInfo[]> =>
  page.evaluate(() => {
    const s = (window as any).Konva.stages[0];
    const c = s.container().getBoundingClientRect();
    return s.find(".selectable")
      .filter((n: any) => n.getClassName() === "Text")
      .map((n: any) => ({
        text: n.text(),
        x: c.left + s.x() + n.x() * s.scaleX(),
        y: c.top + s.y() + n.y() * s.scaleY(),
        w: n.width() * n.scaleX() * s.scaleX(),
        h: n.height() * n.scaleY() * s.scaleY(),
        fontSize: n.fontSize(),
        width: n.width(),
        autoWidth: !!n.getAttr("autoWidth"),
        scaleX: n.scaleX(),
        visible: n.visible(),
      }));
  });

const selected = (page: Page) =>
  page.evaluate(() => {
    const tr = (window as any).Konva.stages[0].findOne("Transformer");
    return { count: tr.nodes().length, anchors: tr.enabledAnchors() as string[] };
  });

const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** Click with the Text tool at (x, y) and type `value`, then Escape. */
async function placeText(page: Page, x: number, y: number, value: string) {
  await textBtn(page).click();
  await page.mouse.click(x, y);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type(value);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

test.describe("text tool", () => {
  test("is enabled, arms from the dock and from T, with a text cursor", async ({ page }) => {
    await openBoard(page);
    await textBtn(page).click();
    await expect(textBtn(page)).toHaveAttribute("aria-pressed", "true");
    const cursor = await page.evaluate(() => (window as any).Konva.stages[0].container().style.cursor);
    expect(cursor).toBe("text");

    await page.keyboard.press("v");
    await expect(textBtn(page)).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("t");
    await expect(textBtn(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("a click opens the editor at once and the tool returns to pointer", async ({ page }) => {
    await openBoard(page);
    await textBtn(page).click();
    await page.mouse.click(400, 300);
    await expect(editor(page)).toBeFocused();
    await expect(pointerBtn(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("typed text lands on the board, selected, auto-width", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 400, 300, "Hello board");
    await expect(editor(page)).toHaveCount(0);
    const [t] = await texts(page);
    expect(t.text).toBe("Hello board");
    expect(t.autoWidth).toBe(true);
    expect(t.visible).toBe(true);
    // Centred on the click vertically: the first line straddles y = 300.
    expect(t.y < 300 && t.y + t.h > 300).toBe(true);
    expect(near(t.x, 400)).toBe(true);
    const sel = await selected(page);
    expect(sel.count).toBe(1);
    // Corners only (#160).
    expect(sel.anchors).toEqual(["top-left", "top-right", "bottom-left", "bottom-right"]);
  });

  test("Enter is a new line, and auto-width grows to the longest line", async ({ page }) => {
    await openBoard(page);
    await textBtn(page).click();
    await page.mouse.click(400, 300);
    await page.keyboard.type("a");
    await page.keyboard.press("Enter");
    await page.keyboard.type("a much longer second line");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const [t] = await texts(page);
    expect(t.text).toBe("a\na much longer second line");
    expect(t.w).toBeGreaterThan(200);
    expect(t.h).toBeGreaterThan(55);    // two 30px lines
  });

  test("a drag places a fixed-width text that wraps at the dragged width", async ({ page }) => {
    await openBoard(page);
    await textBtn(page).click();
    await drag(page, 400, 300, 560, 320);
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type("this sentence is far too long for one line");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const [t] = await texts(page);
    expect(t.autoWidth).toBe(false);
    expect(near(t.x, 400) && near(t.y, 300) && near(t.w, 160)).toBe(true);
    expect(t.h).toBeGreaterThan(60);    // wrapped
  });

  test("an editor finished empty leaves nothing, and no undo step", async ({ page }) => {
    await openBoard(page);
    await textBtn(page).click();
    await page.mouse.click(400, 300);
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type("   ");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    expect(await texts(page)).toHaveLength(0);
    const undoable = await page.evaluate(() => (window as any).Konva.stages[0].find(".selectable").length);
    expect(undoable).toBe(0);
  });

  test("a click elsewhere finishes the edit", async ({ page }) => {
    await openBoard(page);
    await textBtn(page).click();
    await page.mouse.click(400, 300);
    await page.keyboard.type("kept");
    await page.mouse.click(900, 500);
    await page.waitForTimeout(300);
    await expect(editor(page)).toHaveCount(0);
    expect((await texts(page)).map((t) => t.text)).toEqual(["kept"]);
  });

  test("board shortcuts do not fire while typing", async ({ page }) => {
    await openBoard(page);
    await textBtn(page).click();
    await page.mouse.click(400, 300);
    // Each of these is a board command outside the editor.
    await page.keyboard.type("vfrstao");
    await page.keyboard.press("Backspace");
    // Select all inside the editor: Cmd+A on macOS, where Ctrl+A only moves
    // the caret to the start of the line.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("x");
    await expect(pointerBtn(page)).toHaveAttribute("aria-pressed", "true");
    await expect(editor(page)).toHaveValue("x");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    expect((await texts(page)).map((t) => t.text)).toEqual(["x"]);
  });

  test("double-click edits a text, with its text selected", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 400, 300, "first");
    const [t] = await texts(page);
    await page.mouse.dblclick(t.x + t.w / 2, t.y + t.h / 2);
    await expect(editor(page)).toBeFocused();
    // The canvas copy steps aside while the editor shows the text.
    expect((await texts(page))[0].visible).toBe(false);
    await page.keyboard.type("second");          // replaces the selection
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    expect((await texts(page)).map((x) => x.text)).toEqual(["second"]);
  });

  test("create and each edit are one undo step apiece", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 400, 300, "one");
    const [t] = await texts(page);
    await page.mouse.dblclick(t.x + t.w / 2, t.y + t.h / 2);
    await page.keyboard.type("two");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(250);
    expect((await texts(page)).map((x) => x.text)).toEqual(["one"]);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(250);
    expect(await texts(page)).toHaveLength(0);
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(250);
    expect((await texts(page)).map((x) => x.text)).toEqual(["one"]);
  });

  test("emptying an existing text deletes it", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 400, 300, "gone soon");
    const [t] = await texts(page);
    await page.mouse.dblclick(t.x + t.w / 2, t.y + t.h / 2);
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    expect(await texts(page)).toHaveLength(0);
  });

  // Setting a wrap width by dragging returns with Alt-drag, after #160.
  test("a corner scales the font", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 400, 300, "resize me please");
    let [t] = await texts(page);

    // bottom-right corner, outward: bigger font, no scale left behind.
    await drag(page, t.x + t.w, t.y + t.h, t.x + t.w * 1.5, t.y + t.h * 1.5);
    [t] = await texts(page);
    expect(t.fontSize).toBeGreaterThan(30);
    expect(t.scaleX).toBe(1);
  });

  test("moves, copies, deletes, and has no port", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 400, 300, "copy me");
    expect(await portCount(page)).toBe(0);
    let [t] = await texts(page);
    await drag(page, t.x + 10, t.y + t.h / 2, t.x + 110, t.y + t.h / 2 + 50);
    [t] = await texts(page);
    expect(near(t.x, 500)).toBe(true);

    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(300);
    const all = await texts(page);
    expect(all.map((x) => x.text)).toEqual(["copy me", "copy me"]);
    expect(near(all[1].x - all[0].x, 20)).toBe(true);

    await page.keyboard.press("Delete");
    await page.waitForTimeout(250);
    expect(await texts(page)).toHaveLength(1);
  });

  test("moves with a Frame it sits inside", async ({ page }) => {
    await openBoard(page);
    await placeText(page, 450, 320, "framed");
    await frameBtn(page).click();
    await drag(page, 380, 230, 640, 460);
    const before = (await texts(page))[0];
    await drag(page, 400, 250, 520, 320);
    const after = (await texts(page))[0];
    expect(near(after.x - before.x, 120) && near(after.y - before.y, 70)).toBe(true);
  });

  for (const z of [0.5, 1.5]) {
    test(`the editor sits exactly over the text at ${z * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      await setZoom(page, z);
      const actual = await zoom(page);
      await placeText(page, 400, 300, "zoomed");
      const [t] = await texts(page);
      await page.mouse.dblclick(t.x + t.w / 2, t.y + t.h / 2);
      const box = await editor(page).boundingBox();
      expect(box && near(box.x, t.x) && near(box.y, t.y)).toBe(true);
      const font = await editor(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(near(font, 24 * actual, 0.5)).toBe(true);
    });
  }
});
