import { test, expect, type Page } from "@playwright/test";
import {
  openBoard, uploadImage, imageBox, addPanel, addPanelAt, collapsePanels,
  panelBoxes, setZoom, zoom, activePanelCount,
} from "./helpers";

// Copy/paste of generated nodes (#97). The unit tests cover the stores; these
// drive the real keyboard path through Board's handler, the DOM placeholders
// and the Konva layer together.

const placeholders = (page: Page) => page.locator("button.node-panel-placeholder").count();
const images = (page: Page) =>
  page.evaluate(() => (window as any).Konva.stages[0].find("Image").length as number);
// Each wire draws a wide invisible hit path beside its visible stroke.
const wires = (page: Page) => page.locator('svg g > path[stroke-width="12"]').count();

async function centreOf(page: Page, title: "Input" | "Output", pick: (xs: number[]) => number) {
  const pts = await page.evaluate(
    (t) =>
      [...document.querySelectorAll(`div[title="${t}"]`)].map((d) => {
        const r = d.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }),
    title
  );
  const x = pick(pts.map((p) => p.x));
  return pts.find((p) => p.x === x)!;
}

async function wire(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function copyPaste(page: Page) {
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await page.waitForTimeout(500);
}

test.describe("copy and paste", () => {
  test("a Create Image node pastes with its own ports", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);

    const [box] = await panelBoxes(page);
    await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
    await page.waitForTimeout(300);
    await copyPaste(page);

    expect(await placeholders(page)).toBe(2);
    // Counted on the copy's own edges, not in total: the copy lands over its
    // original and occludes the original's output port, by design.
    const copy = (await panelBoxes(page))[1];
    const ports = await page.evaluate(() =>
      [...document.querySelectorAll('div[title="Input"], div[title="Output"]')].map((d) => {
        const r = d.getBoundingClientRect();
        return { kind: d.getAttribute("title"), x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })
    );
    const near = (kind: string, x: number) =>
      ports.some((p) => p.kind === kind && Math.abs(p.x - x) < 12 && p.y > copy.y && p.y < copy.y + copy.h);
    expect(near("Input", copy.x)).toBe(true);
    expect(near("Output", copy.x + copy.w)).toBe(true);
  });

  test("Ctrl+A copies images, nodes and the wire between them; undo and redo take it back and forth", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 800, 600, "harbour.png");
    await addPanelAt(page, 420);

    const img = await imageBox(page);
    const out = await centreOf(page, "Output", (xs) =>
      xs.reduce((a, b) => (Math.abs(b - (img.x + img.w)) < Math.abs(a - (img.x + img.w)) ? b : a))
    );
    const inp = await centreOf(page, "Input", (xs) => Math.max(...xs));
    await wire(page, out, inp);
    expect(await wires(page)).toBe(1);

    await page.mouse.click(1400, 120); // focus the canvas, clear selection
    await page.keyboard.press("ControlOrMeta+a");
    await copyPaste(page);

    expect(await images(page)).toBe(2);
    expect(await placeholders(page)).toBe(2);
    expect(await wires(page)).toBe(2);

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(500);
    expect(await images(page)).toBe(1);
    expect(await placeholders(page)).toBe(1);
    expect(await wires(page)).toBe(1);
    // Names and ports render from konvaNodes, so an undo that left the record
    // behind showed the removed image's name and port floating on the canvas.
    await expect(page.locator('div[title="harbour (2)"]')).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+y");
    await page.waitForTimeout(500);
    expect(await images(page)).toBe(2);
    expect(await placeholders(page)).toBe(2);
    expect(await wires(page)).toBe(2);
    await expect(page.locator('div[title="harbour (2)"]')).toHaveCount(1);
  });

  test("Ctrl+C / Ctrl+V in the instruction box copies text, not the node", async ({ page }) => {
    await openBoard(page);
    await addPanel(page); // panel left open
    const box = page.locator("textarea.node-panel-instruction");
    await box.click();
    await page.keyboard.type("a cat");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+c");
    await page.keyboard.press("End");
    await page.keyboard.press("ControlOrMeta+v");
    await page.waitForTimeout(400);

    expect(await placeholders(page)).toBe(1);
    await expect(box).toHaveValue("a cata cat");
  });

  // PASTE_OFFSET is in canvas units, so on screen it scales with zoom.
  for (const z of [0.5, 1, 1.5]) {
    test(`the copy lands PASTE_OFFSET away at ${z * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      await addPanel(page);
      await collapsePanels(page);
      await setZoom(page, z);
      const scale = await zoom(page);

      const [orig] = await panelBoxes(page);
      await page.mouse.click(orig.x + orig.w / 2, orig.y + orig.h / 2);
      await page.waitForTimeout(300);
      await copyPaste(page);

      const boxes = await panelBoxes(page);
      expect(boxes).toHaveLength(2);
      const copy = boxes[1];
      expect(copy.x - orig.x).toBeCloseTo(20 * scale, 0);
      expect(copy.y - orig.y).toBeCloseTo(20 * scale, 0);
      expect(copy.w).toBeCloseTo(orig.w, 0);
      expect(copy.h).toBeCloseTo(orig.h, 0);
    });
  }

  // Generated images are stored inline as data URLs, so a paste can push the
  // persisted panels past the localStorage quota. The failed save used to
  // throw out of the paste halfway: nodes landed, wires and undo did not.
  test("a paste past the storage quota still brings its wires and undoes in one step", async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      const big = "data:image/png;base64," + "A".repeat(1_600_000);
      const mk = (id: string, x: number) => ({
        id, kind: "image", canvasX: x, canvasY: 300, w: 300, h: 169,
        isActive: false, isPanelOpen: false, label: id, output: { type: "image", value: big },
      });
      localStorage.setItem("gcos-node-panels", JSON.stringify({
        state: { panels: [mk("panel-1", 100), mk("panel-2", 600)] }, version: 0,
      }));
    });
    await openBoard(page);
    const [a, b] = (await panelBoxes(page)).sort((p, q) => p.x - q.x);
    const out = await centreOf(page, "Output", (xs) =>
      xs.reduce((m, x) => (Math.abs(x - (a.x + a.w)) < Math.abs(m - (a.x + a.w)) ? x : m))
    );
    const inp = await centreOf(page, "Input", (xs) =>
      xs.reduce((m, x) => (Math.abs(x - b.x) < Math.abs(m - b.x) ? x : m))
    );
    await wire(page, out, inp);
    expect(await wires(page)).toBe(1);

    await page.mouse.click(1400, 120);
    await page.keyboard.press("ControlOrMeta+a");
    await copyPaste(page);
    expect(await placeholders(page)).toBe(4);
    expect(await wires(page)).toBe(2);

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(500);
    expect(await placeholders(page)).toBe(2);
    expect(await wires(page)).toBe(1);
  });

  test("Shift+click adds a second node to the selection", async ({ page }) => {
    await openBoard(page);
    await addPanelAt(page, -300);
    await addPanelAt(page, 200);
    const [a, b] = (await panelBoxes(page)).sort((p, q) => p.x - q.x);

    await page.mouse.click(a.x + a.w / 2, a.y + a.h / 2);
    await page.keyboard.down("Shift");
    await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(300);

    // Both carry a selection border. Selection is not saved, so it is read
    // from the board, not from localStorage.
    expect(await activePanelCount(page)).toBe(2);
  });
});
