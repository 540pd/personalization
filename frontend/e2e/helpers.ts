import zlib from "node:zlib";
import type { Page } from "@playwright/test";

/** Geometry in screen px. */
export interface Box { x: number; y: number; w: number; h: number }

// ── PNG fixture ──────────────────────────────────────────────────────────────
// Generated rather than committed as a binary, so an upload-sizing test can
// state its input dimensions inline instead of referring to an opaque file.

function crc32(buf: Buffer): number {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, c]);
}

export function makePng(w: number, h: number, rgb: [number, number, number] = [120, 150, 200]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const off = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      const p = off + 1 + x * 3;
      const edge = x < 6 || y < 6 || x > w - 7 || y > h - 7;
      raw[p] = edge ? 20 : rgb[0];
      raw[p + 1] = edge ? 20 : rgb[1];
      raw[p + 2] = edge ? 20 : rgb[2];
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Driving the board ────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function openBoard(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  // Board mounts via next/dynamic with ssr:false, so wait for the stage, not load.
  await page.waitForFunction(() => !!(window as any).Konva?.stages?.length, null, { timeout: 20_000 });
  await page.waitForTimeout(400);
}

export async function uploadImage(page: Page, w: number, h: number, name = "photo.png") {
  const before = await page.evaluate(() => (window as any).Konva.stages[0].find("Image").length);
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "image/png",
    buffer: makePng(w, h),
  });
  await page.waitForFunction(
    (n) => (window as any).Konva.stages[0].find("Image").length > n,
    before,
    { timeout: 15_000 }
  );
  await page.waitForTimeout(250);
}

/** Screen-space box of the nth uploaded image, read from Konva. */
export async function imageBox(page: Page, i = 0): Promise<Box> {
  return page.evaluate((idx) => {
    const s = (window as any).Konva.stages[0];
    const n = s.find("Image")[idx];
    const c = s.container().getBoundingClientRect();
    return {
      x: c.left + s.x() + n.x() * s.scaleX(),
      y: c.top + s.y() + n.y() * s.scaleY(),
      w: n.width() * n.scaleX() * s.scaleX(),
      h: n.height() * n.scaleY() * s.scaleY(),
    };
  }, i);
}

/** Create a Create Image node via the dock. Its panel is left open. */
export async function addPanel(page: Page) {
  const before = await page.locator("button.node-panel-placeholder").count();
  // Scoped to the dock. This was `page.locator("button").nth(1)` -- a
  // position in the whole document, which broke the moment the sidebar put
  // buttons ahead of the dock in the DOM.
  await page.locator(".floating-dock button").nth(1).click();
  await page.waitForTimeout(250);
  await page.locator(".floating-dock-submenu button:has-text('Image')").first().click();
  await page.waitForFunction(
    (n) => document.querySelectorAll("button.node-panel-placeholder").length > n,
    before,
    { timeout: 10_000 }
  );
  await page.waitForTimeout(300);
}

/** Collapse every open panel, leaving placeholders on the canvas. */
export async function collapsePanels(page: Page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

/**
 * Add a node, collapse its panel, and move it clear of the others.
 *
 * New nodes are created at the viewport centre with only a 24px cascade per
 * existing node, so at the default 320px width two of them overlap almost
 * entirely -- which legitimately occludes a port before a test has done
 * anything. Any test about overlap has to place its own nodes.
 */
export async function addPanelAt(page: Page, dx: number) {
  await addPanel(page);
  await collapsePanels(page);
  const boxes = await panelBoxes(page);
  const last = boxes[boxes.length - 1];
  await dragFrom(page, last.x + last.w / 2, last.y + last.h / 2, dx);
}

export async function panelBoxes(page: Page): Promise<(Box & { born: string })[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("button.node-panel-placeholder")].map((e) => {
      const r = e.getBoundingClientRect();
      return { born: (e as HTMLElement).dataset.born ?? "", x: r.x, y: r.y, w: r.width, h: r.height };
    })
  );
}

/**
 * Tag placeholders with their creation order. Dragging reorders the DOM (array
 * order is paint order), so index is not a stable identity across a drag.
 */
export async function tagPanels(page: Page) {
  await page.evaluate(() =>
    [...document.querySelectorAll("button.node-panel-placeholder")].forEach(
      (e, i) => ((e as HTMLElement).dataset.born = String(i))
    )
  );
}

export async function panelByBorn(page: Page, born: string): Promise<Box & { born: string }> {
  const all = await panelBoxes(page);
  const hit = all.find((p) => p.born === born);
  if (!hit) throw new Error(`no panel born=${born}`);
  return hit;
}

/** Press-drag by a delta, crossing the 4px drag threshold. */
export async function dragFrom(page: Page, x: number, y: number, dx: number, dy = 0) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

/** Click empty canvas to clear every selection. */
export async function clickEmpty(page: Page) {
  await page.mouse.click(1400, 120);
  await page.waitForTimeout(250);
}

export async function portCount(page: Page): Promise<number> {
  return page.locator('div[title="Input"], div[title="Output"]').count();
}

export async function portCentres(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('div[title="Input"], div[title="Output"]')]
      .map((d) => {
        const r = d.getBoundingClientRect();
        return {
          kind: d.getAttribute("title"),
          x: Math.round(r.x + r.width / 2),
          y: Math.round(r.y + r.height / 2),
        };
      })
      .sort((a, b) => a.x - b.x)
  );
}

/** Drive the viewport to a scale through Board's wheel handler. */
export async function setZoom(page: Page, target: number) {
  for (let i = 0; i < 48; i++) {
    const cur = await zoom(page);
    if (Math.abs(cur - target) < 0.02) break;
    await page.mouse.move(700, 430);
    await page.mouse.wheel(0, cur > target ? 120 : -120);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(250);
}

export async function zoom(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).Konva.stages[0].scaleX());
}

/** Topmost placeholder at a point, by its `born` tag. */
export async function topmostPanelAt(page: Page, x: number, y: number): Promise<string | null> {
  return page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px as number, py as number);
    const ph = (el as HTMLElement | null)?.closest("button.node-panel-placeholder") as HTMLElement | null;
    return ph?.dataset.born ?? null;
  }, [x, y]);
}

/** Create Image nodes showing their active border. */
export async function activePanelCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    let n = 0;
    for (const d of document.querySelectorAll("div")) {
      const s = getComputedStyle(d);
      if (s.position !== "fixed") continue;
      const r = d.getBoundingClientRect();
      if (r.width > 40 && s.borderStyle === "solid" && parseFloat(s.borderTopWidth) > 0) n++;
    }
    return n;
  });
}
