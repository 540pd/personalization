import { test, expect, type Page } from "@playwright/test";
import { openBoard, setZoom } from "./helpers";

// #223: over a Frame, the style bar sits 14px above it, as over a shape, and
// is lifted over the name row only when it would otherwise sit on the name.

/* eslint-disable @typescript-eslint/no-explicit-any */

const GAP = 14;
const LIFTED = 38; // GAP + the name row (8 + 16)

const frameBtn = (page: Page) => page.locator(".floating-dock button[aria-pressed]").nth(3);
const bar = (page: Page) => page.getByTestId("shape-style-bar");
const frameName = (page: Page, name: string) => page.locator(`div[title="${name}"]`);

async function drawFrame(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await frameBtn(page).click();
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** The Frame's on-screen top edge. */
const frameTop = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const stages = (window as any).Konva.stages as any[];
    const fs = stages.find((st) => st.find(".frame").length);
    return fs.container().getBoundingClientRect().top + fs.find(".frame")[0].getClientRect().y;
  });

/** Screen px between the bar's bottom edge and the Frame's top edge. */
async function gap(page: Page): Promise<number> {
  const box = (await bar(page).boundingBox())!;
  return Math.round((await frameTop(page)) - (box.y + box.height));
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function rename(page: Page, from: string, to: string) {
  await frameName(page, from).dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(to);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
}

test.describe("style bar gap over Frames (#223)", () => {
  test("wide Frame: 14px above it, beside the name", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 350, 250, 750, 500);
    await expect(bar(page)).toHaveAttribute("data-placement", "above");
    expect(await gap(page)).toBe(GAP);
    expect(overlaps((await bar(page).boundingBox())!, (await frameName(page, "Frame").boundingBox())!)).toBe(false);
  });

  test("narrow Frame: lifted above the name, as before", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 500, 300, 610, 420);
    expect(await gap(page)).toBe(LIFTED);
    const box = (await bar(page).boundingBox())!;
    const name = (await frameName(page, "Frame").boundingBox())!;
    expect(overlaps(box, name)).toBe(false);
    expect(box.y + box.height).toBeLessThan(name.y);
  });

  test("a long name reaching the middle lifts it; a short one brings it back", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 350, 250, 750, 500);
    expect(await gap(page)).toBe(GAP);

    const long = "A rather long frame name that reaches the middle";
    await rename(page, "Frame", long);
    await expect(frameName(page, long)).toBeVisible();
    expect(await gap(page)).toBe(LIFTED);
    expect(overlaps((await bar(page).boundingBox())!, (await frameName(page, long).boundingBox())!)).toBe(false);

    await rename(page, long, "Hero");
    await expect(frameName(page, "Hero")).toBeVisible();
    expect(await gap(page)).toBe(GAP);
  });

  test("zooming out can make the same Frame narrow enough to lift", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 450, 250, 650, 450);
    await setZoom(page, 1);
    expect(await gap(page)).toBe(GAP);

    // At 50% the Frame is 100px wide: the centred bar reaches the name.
    // Off 100%, the outline's stroke and the wheel's inexact scale move the
    // measured edge by a pixel.
    await setZoom(page, 0.5);
    await expect(frameName(page, "Frame")).toBeVisible();
    expect(Math.abs((await gap(page)) - LIFTED)).toBeLessThanOrEqual(1);

    await setZoom(page, 1.5);
    expect(Math.abs((await gap(page)) - GAP)).toBeLessThanOrEqual(1);
  });

  test("near the top of the window it still flips below", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 350, 60, 750, 300);
    await expect(bar(page)).toHaveAttribute("data-placement", "below");
    expect((await bar(page).boundingBox())!.y).toBeGreaterThan(300);
  });

  test("the Color card opened at 14px does not cover the name", async ({ page }) => {
    await openBoard(page);
    await drawFrame(page, 350, 250, 750, 500);
    await page.getByRole("button", { name: "Shape color" }).click();
    const card = (await page.getByRole("group", { name: "Shape colors" }).boundingBox())!;
    expect(overlaps(card, (await frameName(page, "Frame").boundingBox())!)).toBe(false);
  });
});
