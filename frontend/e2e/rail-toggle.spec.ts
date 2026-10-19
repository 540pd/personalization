import { test, expect, type Page } from "@playwright/test";
import { openBoard } from "./helpers";

// #221: collapsing the rail keeps the collapse button and the nav items at
// the same height. The header used to stack into two rows when collapsed,
// dropping the button 32px and every item 28px.

const RAIL_WIDTH = 64;

type Box = { x: number; y: number; width: number; height: number };
const box = async (page: Page, sel: string): Promise<Box> => (await page.locator(sel).first().boundingBox())!;

async function expanded(page: Page) {
  await openBoard(page);
  await page.evaluate(() => localStorage.setItem("gcos-sidebar-collapsed", "false"));
  await openBoard(page);
}

async function toggle(page: Page) {
  await page.locator(".sidebar-collapse-button").click();
  // Past the rail's 150 ms width transition.
  await page.waitForTimeout(300);
}

test.describe("rail collapse button (#221)", () => {
  test("button and nav items keep their height in both states", async ({ page }) => {
    await expanded(page);
    const button = await box(page, ".sidebar-collapse-button");
    const items = await page.locator(".sidebar-nav .sidebar-item").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));

    await toggle(page);
    const buttonAfter = await box(page, ".sidebar-collapse-button");
    const itemsAfter = await page.locator(".sidebar-nav .sidebar-item").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));

    expect(Math.abs(buttonAfter.y - button.y)).toBeLessThanOrEqual(1);
    expect(itemsAfter).toHaveLength(items.length);
    itemsAfter.forEach((y, i) => expect(Math.abs(y - items[i])).toBeLessThanOrEqual(1));
  });

  test("collapsed, mark and button share one row inside the rail", async ({ page }) => {
    await expanded(page);
    await toggle(page);
    const mark = await box(page, ".sidebar-brandmark");
    const button = await box(page, ".sidebar-collapse-button");

    // One row: their vertical centres agree, mark first.
    expect(Math.abs(mark.y + mark.height / 2 - (button.y + button.height / 2))).toBeLessThanOrEqual(2);
    expect(mark.x + mark.width).toBeLessThanOrEqual(button.x);
    // Clear of both rail edges, button at full size.
    expect(mark.x).toBeGreaterThanOrEqual(8);
    expect(button.x + button.width).toBeLessThanOrEqual(RAIL_WIDTH - 8);
    expect(Math.round(button.width)).toBe(24);
    expect(Math.round(button.height)).toBe(24);
  });

  test("clicking twice without moving the pointer expands again", async ({ page }) => {
    await expanded(page);
    const b = await box(page, ".sidebar-collapse-button");
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(300);
    await expect(page.locator(".sidebar-minimized")).toBeVisible();
    // Same height; only x moves with the rail, so follow it sideways only.
    const c = await box(page, ".sidebar-collapse-button");
    expect(Math.abs(c.y - b.y)).toBeLessThanOrEqual(1);
    await page.mouse.click(c.x + c.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(300);
    await expect(page.locator(".sidebar-minimized")).toHaveCount(0);
  });

  test("collapsed tooltips open at the rail's edge, clear of the other control", async ({ page }) => {
    await expanded(page);
    await toggle(page);
    const button = await box(page, ".sidebar-collapse-button");
    const header = await box(page, ".sidebar-header");

    await page.locator(".sidebar-brandmark").hover();
    const markTip = page.locator(".sidebar-header .tooltip").first();
    await expect(markTip).toHaveCSS("opacity", "1");
    await expect(markTip).toHaveText(/Studio \/ PlaySpace/);
    const mt = (await markTip.boundingBox())!;
    expect(mt.x).toBeGreaterThanOrEqual(RAIL_WIDTH);
    expect(mt.x).toBeGreaterThan(button.x + button.width);
    expect(Math.abs(mt.y + mt.height / 2 - (header.y + header.height / 2))).toBeLessThanOrEqual(2);

    await page.locator(".sidebar-collapse-button").hover();
    const buttonTip = page.locator(".sidebar-header .tooltip").nth(1);
    await expect(buttonTip).toHaveCSS("opacity", "1");
    await expect(buttonTip).toHaveText("Expand sidebar");
    expect((await buttonTip.boundingBox())!.x).toBeGreaterThanOrEqual(RAIL_WIDTH);
  });

  test("keyboard toggling keeps focus on the button", async ({ page }) => {
    await expanded(page);
    await page.getByRole("button", { name: "Collapse sidebar" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeFocused();
  });
});
