import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, addPanel, collapsePanels, makePng, panelBoxes, setZoom, reloadBoard } from "./helpers";

// Issue #114. A Create Image node asked for N > 1 images becomes the first of
// N Create Image nodes in a Frame of their own, every one carrying its inputs.
// The backend half is #113; these stub /api/proxy/** so they hold without it,
// and assert what the canvas sends as well as what it does with the answer.

const IMG = (n: number) => `data:image/png;base64,${makePng(8 + n, 8 + n).toString("base64")}`;

type Reply = { status?: number; body: Record<string, unknown> };
type Rect = { x: number; y: number; w: number; h: number };

/** Answer generation with `reply(variants)`, recording each request body. */
async function stubGenerate(page: Page, reply: (variants: number) => Reply) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/proxy/**", async (route: Route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    const body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
    bodies.push(body);
    const r = reply(typeof body.variants === "number" ? body.variants : 1);
    await route.fulfill({
      status: r.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(r.body),
    });
  });
  return bodies;
}

const allSucceed = (n: number): Reply => ({
  body: n === 1
    ? { jobId: "j", status: "done", imageUrl: IMG(0), modelUsed: "m" }
    : { jobId: "j", status: "done", imageUrls: Array.from({ length: n }, (_, i) => IMG(i)), modelUsed: "m" },
});

async function create(page: Page, instruction: string, images?: number) {
  await page.locator("textarea").first().fill(instruction);
  if (images) await page.locator('select[aria-label="Images"]').selectOption(String(images));
  await page.locator("button:has-text('Create')").first().click();
  await page.waitForTimeout(1500);
}

/** Frames, read from whichever Konva stage paints them, in screen pixels. */
const frames = (page: Page): Promise<Rect[]> =>
  page.evaluate(() => {
    type N = { getClientRect(): { x: number; y: number; width: number; height: number } };
    const stages = (window as unknown as { Konva: { stages: { find(q: string): N[] }[] } }).Konva.stages;
    return stages.flatMap((s) => s.find(".frame")).map((n) => {
      const r = n.getClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
  });

const previews = (page: Page) => page.locator("img.node-panel-preview");

const inside = (o: Rect, i: Rect) =>
  i.x >= o.x - 1 && i.y >= o.y - 1 && i.x + i.w <= o.x + o.w + 1 && i.y + i.h <= o.y + o.h + 1;

/** Open a node's panel: one click selects it, the second opens the form. */
async function openPanel(page: Page, box: Rect) {
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await page.waitForTimeout(250);
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await page.waitForTimeout(400);
}

test.describe("image variants", () => {
  test("x1 is unchanged: one image in the node and no frame", async ({ page }) => {
    const bodies = await stubGenerate(page, allSucceed);
    await openBoard(page);
    await addPanel(page);

    await create(page, "a red kite");

    // The original request shape, so a backend without #113 still answers it.
    expect(bodies[0].variants).toBeUndefined();
    await expect(previews(page)).toHaveCount(1);
    expect(await panelBoxes(page)).toHaveLength(1);
    expect(await frames(page)).toHaveLength(0);
  });

  test("x4 gives four Create nodes, each with an image, inside one frame", async ({ page }) => {
    const bodies = await stubGenerate(page, allSucceed);
    await openBoard(page);
    await addPanel(page);

    await create(page, "a red kite", 4);

    expect(bodies[0].variants).toBe(4);
    const nodes = await panelBoxes(page);
    expect(nodes).toHaveLength(4);
    // Nothing left blank: the node the prompt was typed into shows variant 1.
    await expect(previews(page)).toHaveCount(4);
    const [f] = await frames(page);
    nodes.forEach((n) => expect(inside(f, n)).toBe(true));
  });

  /** Handles on the frame stage: how many frames are selected. */
  const selectedFrames = (page: Page) =>
    page.evaluate(() => {
      type S = { find(q: string): unknown[]; findOne(q: string): { nodes(): unknown[] } | undefined };
      const fs = (window as unknown as { Konva: { stages: S[] } }).Konva.stages.find((st) => st.find(".frame").length);
      return fs?.findOne("Transformer")?.nodes().length ?? 0;
    });

  test("the new frame is selected when the batch lands", async ({ page }) => {
    await stubGenerate(page, allSucceed);
    await openBoard(page);
    await addPanel(page);

    await create(page, "a red kite", 3);

    expect(await selectedFrames(page)).toBe(1);
    // One selection at a time (#107): no node keeps its outline beside it.
    await expect(page.locator("textarea")).toHaveCount(0);
  });

  test("clicking empty board then clears the frame selection", async ({ page }) => {
    await stubGenerate(page, allSucceed);
    await openBoard(page);
    await addPanel(page);
    await create(page, "a red kite", 2);

    await page.mouse.click(300, 650);
    await page.waitForTimeout(400);
    expect(await selectedFrames(page)).toBe(0);
  });

  test("a partial batch keeps the form open so its message stays visible", async ({ page }) => {
    await stubGenerate(page, () => ({
      body: { jobId: "j", status: "done", modelUsed: "m", imageUrls: [IMG(0), IMG(1)],
              errors: [{ index: 2, message: "quota" }] },
    }));
    await openBoard(page);
    await addPanel(page);

    await create(page, "a red kite", 3);

    expect(await selectedFrames(page)).toBe(0);
    await expect(page.locator(".node-panel-error")).toBeVisible();
  });

  test("the node you configured does not move", async ({ page }) => {
    await stubGenerate(page, allSucceed);
    await openBoard(page);
    await addPanel(page);
    const [before] = await panelBoxes(page);

    await create(page, "a red kite", 3);

    const [after] = await panelBoxes(page);
    expect(Math.round(after.x)).toBe(Math.round(before.x));
    expect(Math.round(after.y)).toBe(Math.round(before.y));
  });

  test("every variant carries the source's prompt and settings", async ({ page }) => {
    await stubGenerate(page, allSucceed);
    await openBoard(page);
    await addPanel(page);
    await page.locator('select[aria-label="Aspect ratio"]').selectOption("4:3");

    await create(page, "a red kite", 2);
    await collapsePanels(page);

    const [, copy] = await panelBoxes(page);
    await openPanel(page, copy);

    await expect(page.locator("textarea").first()).toHaveValue("a red kite");
    await expect(page.locator('select[aria-label="Aspect ratio"]')).toHaveValue("4:3");
    await expect(page.locator('select[aria-label="Images"]')).toHaveValue("2");
  });

  test("a variant's inputs survive a reload", async ({ page }) => {
    await stubGenerate(page, allSucceed);
    await openBoard(page);
    await addPanel(page);
    await create(page, "a red kite", 2);
    await collapsePanels(page);

    await reloadBoard(page, { panels: 2 });

    const [, copy] = await panelBoxes(page);
    await openPanel(page, copy);
    await expect(page.locator("textarea").first()).toHaveValue("a red kite");
  });

  test("ten variants all stay inside their frame", async ({ page }) => {
    await stubGenerate(page, allSucceed);
    await openBoard(page);
    await addPanel(page);

    await create(page, "a red kite", 10);

    const nodes = await panelBoxes(page);
    expect(nodes).toHaveLength(10);
    const [f] = await frames(page);
    nodes.forEach((n) => expect(inside(f, n)).toBe(true));
  });

  test("the frame and the copies are named after the node", async ({ page }) => {
    await stubGenerate(page, allSucceed);
    await openBoard(page);
    await addPanel(page);

    await create(page, "a red kite", 3);

    await expect(page.locator('div[title="a red kite variants"]')).toHaveCount(1);
    await expect(page.locator('div[title="a red kite"]')).toHaveCount(1);
    await expect(page.locator('div[title="a red kite (2)"]')).toHaveCount(1);
    await expect(page.locator('div[title="a red kite (3)"]')).toHaveCount(1);
  });

  test("a partial batch keeps what worked and says how many failed", async ({ page }) => {
    await stubGenerate(page, () => ({
      body: {
        jobId: "j", status: "done", modelUsed: "m",
        imageUrls: [IMG(0), IMG(1)],
        errors: [{ index: 1, message: "quota" }, { index: 3, message: "quota" }],
      },
    }));
    await openBoard(page);
    await addPanel(page);

    await create(page, "a red kite", 4);

    expect(await panelBoxes(page)).toHaveLength(2);
    expect(await frames(page)).toHaveLength(1);
    await expect(page.locator(".node-panel-error")).toHaveText("2 of 4 variants failed to generate.");
  });

  test("a batch that fails entirely leaves the node alone and no frame", async ({ page }) => {
    await stubGenerate(page, () => ({
      status: 500,
      body: { error: "internal_error", message: "model unavailable" },
    }));
    await openBoard(page);
    await addPanel(page);

    await create(page, "a red kite", 4);

    expect(await panelBoxes(page)).toHaveLength(1);
    expect(await frames(page)).toHaveLength(0);
    await expect(page.locator(".node-panel-error")).toBeVisible();
    // Recoverable: the button is back, not stuck spinning.
    await expect(page.locator("button:has-text('Create')").first()).toBeEnabled();
  });

  // A backend without #113 ignores `variants` and sends the one-image shape.
  test("says so plainly when the backend can only make one image", async ({ page }) => {
    await stubGenerate(page, () => allSucceed(1));
    await openBoard(page);
    await addPanel(page);

    await create(page, "a red kite", 4);

    await expect(page.locator(".node-panel-error")).toContainText("can only make one image at a time");
    expect(await frames(page)).toHaveLength(0);
  });

  test("the whole batch is one undo step, and comes back on redo", async ({ page }) => {
    await stubGenerate(page, allSucceed);
    await openBoard(page);
    await addPanel(page);
    await create(page, "a red kite", 4);
    await collapsePanels(page);

    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(500);
    expect(await panelBoxes(page)).toHaveLength(1);
    expect(await frames(page)).toHaveLength(0);
    await expect(previews(page)).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+y");
    await page.waitForTimeout(500);
    expect(await panelBoxes(page)).toHaveLength(4);
    expect(await frames(page)).toHaveLength(1);
  });

  test("dragging the frame carries every variant with it", async ({ page }) => {
    await stubGenerate(page, allSucceed);
    await openBoard(page);
    await addPanel(page);
    await create(page, "a red kite", 2);
    await collapsePanels(page);

    const before = await panelBoxes(page);
    const [f] = await frames(page);
    // The frame's bare padding, clear of every node.
    const grab = { x: f.x + 10, y: f.y + 10 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 60, grab.y + 40, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = await panelBoxes(page);
    after.forEach((n, i) => {
      expect(Math.round(n.x - before[i].x)).toBe(60);
      expect(Math.round(n.y - before[i].y)).toBe(40);
    });
  });

  // Real images are data URLs of a megabyte or more, and Create nodes are
  // saved to localStorage, which holds about 5 MB. Saving a batch used to
  // throw QuotaExceededError out of the store, which aborted the generate
  // handler after the copies appeared but before the frame was made.
  test("a batch of real-sized images still gets its frame", async ({ page }) => {
    // ~1.6 MB each of base64 that will not compress -- what a 2K render is.
    const big = (n: number) =>
      "data:image/png;base64," + Buffer.from(Array.from({ length: 1_200_000 }, (_, i) => (i * 31 + n * 7) % 251)).toString("base64");
    await stubGenerate(page, (n) => ({
      body: { jobId: "j", status: "done", modelUsed: "m", imageUrls: Array.from({ length: n }, (_, i) => big(i)) },
    }));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openBoard(page);
    await addPanel(page);

    await create(page, "a red kite", 4);

    expect(await panelBoxes(page)).toHaveLength(4);
    expect(await frames(page)).toHaveLength(1);
    await expect(page.locator(".node-panel-error")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  /** Is the open form the topmost thing across its whole box? */
  const formOnTop = (page: Page) =>
    page.evaluate(() => {
      const form = document.querySelector(".node-panel-create");
      if (!form) return "no form open";
      const r = form.getBoundingClientRect();
      const misses: string[] = [];
      for (const fx of [0.1, 0.5, 0.9]) {
        for (const fy of [0.1, 0.5, 0.9]) {
          const x = r.x + r.width * fx;
          const y = r.y + r.height * fy;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          const el = document.elementFromPoint(x, y);
          if (!el || !form.contains(el)) misses.push(`${fx},${fy} -> ${el?.className || el?.tagName}`);
        }
      }
      return misses.length ? misses.join("; ") : "on top";
    });

  // The form opens to the right of its node -- exactly where variant (2)
  // sits. Same layer as every node, and later in the page, so the copy used
  // to paint straight over the form of the node that made it.
  test("a node's open form is above the variants beside it", async ({ page }) => {
    await stubGenerate(page, allSucceed);
    await openBoard(page);
    await addPanel(page);
    await create(page, "a red kite", 2);
    await collapsePanels(page);

    const [source] = await panelBoxes(page);
    await openPanel(page, source);

    expect(await formOnTop(page)).toBe("on top");
  });

  // An uploaded image dragged last puts the whole canvas layer in front of
  // every node; the form must still come out above it.
  test("an open form sits above the canvas layer, whichever way it is flipped", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    const z = await page.evaluate(() => {
      const form = document.querySelector(".node-panel-create") as HTMLElement | null;
      const zs = [...document.querySelectorAll("div")]
        .filter((d) => d.querySelector(":scope > .konvajs-content"))
        .map((d) => Number(getComputedStyle(d).zIndex) || 0);
      return { form: Number(form ? getComputedStyle(form).zIndex : -1), canvases: zs };
    });
    // canvasAbove is the highest a canvas container ever goes.
    expect(z.form).toBeGreaterThan(30);
    z.canvases.forEach((c) => expect(z.form).toBeGreaterThan(c));
  });

  test("offers x1 to x10, labelled Images", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);

    const select = page.locator('select[aria-label="Images"]');
    await expect(select).toHaveAttribute("title", "Images");
    await expect(select).toHaveValue("1");
    const labels = await select.locator("option").allTextContents();
    expect(labels).toEqual(Array.from({ length: 10 }, (_, i) => `×${i + 1}`));
  });

  test("shows how many images are coming while it works", async ({ page }) => {
    await page.route("**/api/proxy/**", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((r) => setTimeout(r, 1200));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(allSucceed(3).body) });
    });
    await openBoard(page);
    await addPanel(page);

    await page.locator("textarea").first().fill("a red kite");
    await page.locator('select[aria-label="Images"]').selectOption("3");
    await page.locator("button:has-text('Create')").first().click();

    await expect(page.locator("button:has-text('Creating 3 images')")).toBeVisible();
  });

  // Layout is in canvas units, so it should not care what the zoom is -- but
  // frame membership and the node sizes both pass through scale on the way to
  // the screen, which is where that would break if it did.
  for (const level of [0.5, 1, 1.5]) {
    test(`variants stay inside their frame at ${level * 100}% zoom`, async ({ page }) => {
      await stubGenerate(page, allSucceed);
      await openBoard(page);
      if (level !== 1) await setZoom(page, level);
      await addPanel(page);

      await create(page, "a red kite", 4);

      const nodes = await panelBoxes(page);
      expect(nodes).toHaveLength(4);
      const [f] = await frames(page);
      nodes.forEach((n) => expect(inside(f, n)).toBe(true));
    });
  }
});
