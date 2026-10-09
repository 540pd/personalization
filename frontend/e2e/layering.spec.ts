import { test, expect, type Page } from "@playwright/test";
import { openBoard, uploadImage, imageBox, addPanel, collapsePanels, panelBoxes } from "./helpers";

// Konva shapes all share ONE <canvas> and the node placeholders are DOM
// siblings of it, so a DOM element cannot interleave with canvas pixels: the
// whole canvas is in front of the placeholders or behind them.
//
// Before this, the canvas had no z-index at all, so every Create Image node
// sat permanently above every uploaded image and dragging an image onto one
// made it disappear entirely. Whichever kind you last picked up now wins.

/**
 * Which layer paints in front.
 *
 * Compared by z-index rather than elementFromPoint: while the canvas is in
 * front it carries pointer-events: none everywhere a shape is not, so hit
 * order and paint order are deliberately different. elementFromPoint would
 * report the hit target and say nothing about what you can see.
 */
async function frontLayer(page: Page): Promise<"canvas" | "dom"> {
  return page.evaluate(() => {
    let host = document.querySelector("canvas")?.parentElement as HTMLElement | null;
    while (host && getComputedStyle(host).zIndex === "auto") host = host.parentElement;
    const panel = document.querySelector("button.node-panel-placeholder") as HTMLElement | null;
    const cz = Number(getComputedStyle(host!).zIndex);
    // With no panel on the board there is nothing to be in front of; report
    // the canvas rather than throwing on a null element.
    if (!panel) return "canvas";
    return cz > Number(getComputedStyle(panel).zIndex) ? "canvas" : "dom";
  });
}

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(450);
}

test.describe("layering between uploaded images and node panels", () => {
  test("the one you last dragged is the one in front", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const [panel] = await panelBoxes(page);
    const centre = { x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 };

    await uploadImage(page, 1600, 900);
    const img = await imageBox(page);

    // Overlap the right half of the panel, leaving its left edge exposed.
    // A full cover would make the panel genuinely unreachable -- which is
    // correct, but then there is nothing left to press to bring it back.
    await dragTo(page, { x: img.x + img.w / 2, y: img.y + img.h / 2 },
                       { x: centre.x + panel.w * 0.6, y: centre.y });
    expect(await frontLayer(page)).toBe("canvas");

    // Now drag the panel; it should come back to the front.
    // Drag the panel from a corner the image does not cover, so the gesture
    // lands on the placeholder rather than the canvas in front of it.
    const [p2] = await panelBoxes(page);
    await dragTo(page, { x: p2.x + 20, y: p2.y + 20 }, { x: p2.x + 20, y: p2.y + 30 });
    expect(await frontLayer(page)).toBe("dom");

    // And back again. Move the panel clear first: it is in front now, so a
    // press on the overlap would grab the panel, not the image -- which is
    // itself correct behaviour.
    const [p3] = await panelBoxes(page);
    await dragTo(page, { x: p3.x + 20, y: p3.y + 20 }, { x: p3.x + 20, y: p3.y + 300 });
    const img2 = await imageBox(page);
    await dragTo(page, { x: img2.x + img2.w / 2, y: img2.y + img2.h / 2 },
                       { x: img2.x + img2.w / 2 + 20, y: img2.y + img2.h / 2 });
    expect(await frontLayer(page)).toBe("canvas");
  });

  test("a newly created node is not hidden behind an image", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 1600, 900);
    const img = await imageBox(page);
    // Last action was an upload, so the canvas is in front.
    expect(await frontLayer(page)).toBe("canvas");

    await addPanel(page);
    await collapsePanels(page);
    const [panel] = await panelBoxes(page);
    expect(await frontLayer(page)).toBe("dom");
  });

  test("a newly uploaded image is not hidden behind a node", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    await uploadImage(page, 1600, 900);
    const img = await imageBox(page);
    expect(await frontLayer(page)).toBe("canvas");
  });

  // Chrome must stay reachable whichever layer is in front, or you could not
  // start a connection from a node the canvas is covering.
  test("ports stay above the canvas even when the canvas is in front", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    await uploadImage(page, 1600, 900);   // raises the canvas

    const ports = await page.locator('div[title="Input"], div[title="Output"]').count();
    expect(ports).toBeGreaterThan(0);
    const z = await page.evaluate(() => {
      const port = document.querySelector('div[title="Output"]') as HTMLElement | null;
      // Konva nests its own div inside our container, so walk up until a
      // z-index is actually set.
      let host = document.querySelector("canvas")?.parentElement as HTMLElement | null;
      while (host && getComputedStyle(host).zIndex === "auto") host = host.parentElement;
      return {
        port: Number(getComputedStyle(port!).zIndex),
        canvas: Number(getComputedStyle(host!).zIndex),
      };
    });
    expect(z.port).toBeGreaterThan(z.canvas);
  });

  // Dragging one node must not carry another along. The panel's pointermove
  // handler used to fire for any pointer crossing it with a button held, so
  // dragging an uploaded image past a Create Image node dragged that too --
  // using whatever stale dragStart was left over. Measured 172px of drift.
  test("dragging an image does not carry an unselected node with it", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const [p0] = await panelBoxes(page);
    await dragTo(page, { x: p0.x + p0.w / 2, y: p0.y + p0.h / 2 },
                       { x: p0.x + p0.w / 2 + 260, y: p0.y + p0.h / 2 });
    const before = (await panelBoxes(page))[0];

    await uploadImage(page, 1600, 900);
    const img = await imageBox(page);

    // Drag the image straight across the panel, in small steps so every
    // intermediate pointermove lands on it.
    await page.mouse.move(img.x + img.w / 2, img.y + img.h / 2);
    await page.mouse.down();
    for (let i = 1; i <= 24; i++) {
      await page.mouse.move(img.x + img.w / 2 + i * 18, img.y + img.h / 2, { steps: 1 });
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = (await panelBoxes(page))[0];
    expect(Math.round(after.x)).toBe(Math.round(before.x));
    expect(Math.round(after.y)).toBe(Math.round(before.y));
  });

  test("dragging a node still moves that node", async ({ page }) => {
    // The guard must not break the thing it is guarding.
    await openBoard(page);
    await addPanel(page);
    await collapsePanels(page);
    const [before] = await panelBoxes(page);
    await dragTo(page, { x: before.x + before.w / 2, y: before.y + before.h / 2 },
                       { x: before.x + before.w / 2 + 120, y: before.y + before.h / 2 + 40 });
    const [after] = await panelBoxes(page);
    expect(Math.round(after.x - before.x)).toBe(120);
    expect(Math.round(after.y - before.y)).toBe(40);
  });

  // The rail is a third layer above both of the two this file is otherwise
  // about. It shipped with a bare z-50, which tied with the ports and lost to
  // the labels: the image hid behind the rail correctly while its name and
  // its port dot went on drawing over the top of it.
  test("the rail covers a node's label and port, not just the node", async ({ page }) => {
    await openBoard(page);            // the rail is open by default
    await uploadImage(page, 800, 600);
    // The name and the ports only render while the node is selected, which is
    // also the state you are in right after dragging it under the rail.
    const sel = await imageBox(page);
    await page.mouse.click(sel.x + 40, sel.y + 40);
    await page.waitForTimeout(400);

    const z = await page.evaluate(() => {
      const el = (s: string) => document.querySelector(s) as HTMLElement | null;
      const rail = el(".sidebar");
      const label = el('div[title="photo"]');
      const port = el('div[title="Output"]');
      return {
        rail: Number(getComputedStyle(rail!).zIndex),
        label: label ? Number(getComputedStyle(label).zIndex) : null,
        port: port ? Number(getComputedStyle(port).zIndex) : null,
      };
    });
    expect(z.label).not.toBeNull();
    expect(z.rail).toBeGreaterThan(z.label!);
    if (z.port !== null) expect(z.rail).toBeGreaterThan(z.port);

    // And in paint order, not only in the numbers: drag the image under the
    // rail and ask what is actually on top where its name is.
    const img = await imageBox(page);
    // Left edge to 30px: far enough under the rail that the label (which
    // starts at the node's left edge) is fully covered, but not so far that
    // it leaves the window and elementFromPoint has nothing to report.
    await dragTo(page, { x: img.x + img.w / 2, y: img.y + img.h / 2 },
                       { x: 30 + img.w / 2, y: img.y + img.h / 2 });

    const onTop = await page.evaluate(() => {
      const label = document.querySelector('div[title="photo"]') as HTMLElement | null;
      if (!label) return "no-label";
      const r = label.getBoundingClientRect();
      const rail = document.querySelector(".sidebar")!.getBoundingClientRect();
      // Only meaningful if the label really did end up under the rail.
      if (r.right > rail.right) return "not-under-rail";
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit) return "off-screen";
      return hit.closest(".sidebar") ? "rail" : "label";
    });
    expect(onTop).toBe("rail");
  });
});
