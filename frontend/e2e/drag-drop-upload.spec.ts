import { test, expect, type Page } from "@playwright/test";
import { openBoard, imageBox, makePng, collapseSidebar } from "./helpers";

// #38 — dragging an image onto the board used to navigate to the file,
// replacing the board with the raw image and losing the session.
//
// Playwright cannot drive a real OS drag, so these synthesise the DataTransfer
// the browser would build. That is enough to exercise everything we own: the
// listeners, the preventDefault, the accept filter and the drop placement.

interface KonvaWindow {
  Konva?: { stages: { find(sel: string): unknown[] }[] };
}

async function imageCount(page: Page) {
  return page.evaluate(
    () => (window as unknown as KonvaWindow).Konva!.stages[0].find("Image").length
  );
}

/**
 * Fire a drag sequence at a point. `files` are described rather than passed so
 * the whole thing can be built inside the page.
 */
async function dropFiles(
  page: Page,
  at: { x: number; y: number },
  files: { name: string; type: string; base64: string }[]
) {
  await page.evaluate(
    async ({ at, files }) => {
      const dt = new DataTransfer();
      for (const f of files) {
        const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], f.name, { type: f.type }));
      }
      const init = {
        clientX: at.x,
        clientY: at.y,
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
      };
      const target = document.elementFromPoint(at.x, at.y) ?? document.body;
      target.dispatchEvent(new DragEvent("dragenter", init));
      target.dispatchEvent(new DragEvent("dragover", init));
      target.dispatchEvent(new DragEvent("drop", init));
    },
    { at, files }
  );
  await page.waitForTimeout(500);
}

function png(name = "dropped.png", w = 400, h = 300) {
  return { name, type: "image/png", base64: makePng(w, h).toString("base64") };
}

test.describe("drag and drop upload", () => {
  test("adds a dropped image to the board", async ({ page }) => {
    await openBoard(page);
    expect(await imageCount(page)).toBe(0);

    await dropFiles(page, { x: 700, y: 400 }, [png()]);

    expect(await imageCount(page)).toBe(1);
  });

  // The headline bug: the board must still be the board afterwards.
  test("does not navigate away from the board", async ({ page }) => {
    await openBoard(page);
    const before = page.url();

    await dropFiles(page, { x: 700, y: 400 }, [png()]);

    expect(page.url()).toBe(before);
    // Still a live Konva stage, not a bare image document.
    const alive = await page.evaluate(
      () => !!(window as unknown as KonvaWindow).Konva?.stages?.length
    );
    expect(alive).toBe(true);
  });

  test("lands the image under the cursor, not at the centre", async ({ page }) => {
    await openBoard(page);
    await dropFiles(page, { x: 900, y: 250 }, [png()]);

    const box = await imageBox(page);
    const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    // Generous: the point is that it tracks the drop, not the viewport centre.
    expect(Math.abs(centre.x - 900)).toBeLessThan(40);
    expect(Math.abs(centre.y - 250)).toBeLessThan(40);
  });

  test("cascades a multi-file drop instead of stacking it", async ({ page }) => {
    await openBoard(page);
    await dropFiles(page, { x: 700, y: 400 }, [png("a.png"), png("b.png")]);

    expect(await imageCount(page)).toBe(2);
    const a = await imageBox(page, 0);
    const b = await imageBox(page, 1);
    expect(a.x).not.toBeCloseTo(b.x, 0);
  });

  test("ignores an unsupported file", async ({ page }) => {
    await openBoard(page);
    await dropFiles(page, { x: 700, y: 400 }, [
      { name: "notes.pdf", type: "application/pdf", base64: "JVBERi0xLjQK" },
    ]);

    // Previously this became an anonymous 240x64 rect.
    expect(await imageCount(page)).toBe(0);
  });

  test("takes the images out of a mixed drop and leaves the rest", async ({ page }) => {
    await openBoard(page);
    await dropFiles(page, { x: 700, y: 400 }, [
      png("good.png"),
      { name: "notes.pdf", type: "application/pdf", base64: "JVBERi0xLjQK" },
    ]);

    expect(await imageCount(page)).toBe(1);
  });

  // The Konva container is fixed inset:0 and runs UNDER the rail, so hit-testing
  // the container would accept this and land a node behind the sidebar.
  test("ignores a drop on the sidebar", async ({ page }) => {
    await openBoard(page);
    await dropFiles(page, { x: 40, y: 300 }, [png()]);

    expect(await imageCount(page)).toBe(0);
  });

  test("accepts a drop where the rail used to be once it is collapsed", async ({ page }) => {
    await openBoard(page);
    await collapseSidebar(page);
    await page.waitForTimeout(300);

    await dropFiles(page, { x: 120, y: 300 }, [png()]);

    // The area is read per event, so collapsing widens what counts as canvas.
    expect(await imageCount(page)).toBe(1);
  });

  test("shows the drop affordance only while a file drag is over the canvas", async ({ page }) => {
    await openBoard(page);
    const overlay = page.locator('[data-testid="canvas-drop-overlay"]');
    await expect(overlay).toHaveCount(0);

    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["x"], "a.png", { type: "image/png" }));
      window.dispatchEvent(
        new DragEvent("dragenter", { clientX: 700, clientY: 400, dataTransfer: dt, bubbles: true })
      );
    });
    await expect(overlay).toHaveCount(1);

    // And it clears once the drag ends.
    await page.evaluate(() => window.dispatchEvent(new DragEvent("dragend", { bubbles: true })));
    await expect(overlay).toHaveCount(0);
  });

  test("the upload button still works", async ({ page }) => {
    await openBoard(page);
    // Guards the shared canvas:upload path: a drop now carries `at` and the
    // picker does not, and the picker must keep centring.
    await page.locator('input[type="file"]').setInputFiles({
      name: "picked.png",
      mimeType: "image/png",
      buffer: makePng(400, 300),
    });
    await page.waitForTimeout(600);

    expect(await imageCount(page)).toBe(1);
  });
});
