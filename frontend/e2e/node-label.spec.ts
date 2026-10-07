import { test, expect } from "@playwright/test";
import { LABEL_GAP, LABEL_FONT_SIZE, LABEL_LINE_HEIGHT } from "../src/constants/canvas.constants";
import { openBoard, uploadImage, imageBox } from "./helpers";

// The name above a selected node is shared by both node types via NodeLabel,
// so these cover both. LABEL_GAP is the gap you see: a 16px line box around a
// 12px font leaves half-leading under the glyphs, which NodeLabel subtracts.

test.describe("node name label", () => {
  test("sits LABEL_GAP above the node, measuring from the glyphs", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 1600, 900, "harbour.png");
    const box = await imageBox(page);

    await page.mouse.click(box.x + 40, box.y + 40);
    await page.waitForTimeout(500);

    const measured = await page.evaluate(() => {
      const d = [...document.querySelectorAll("div")].find(
        (e) => getComputedStyle(e).position === "fixed" && e.textContent === "harbour" && e.children.length === 0
      );
      if (!d) return null;
      const r = d.getBoundingClientRect();
      const cs = getComputedStyle(d);
      return {
        bottom: r.bottom,
        halfLeading: (parseFloat(cs.lineHeight) - parseFloat(cs.fontSize)) / 2,
        fontSize: parseFloat(cs.fontSize),
        lineHeight: parseFloat(cs.lineHeight),
      };
    });

    expect(measured).not.toBeNull();
    expect(measured!.fontSize).toBe(LABEL_FONT_SIZE);
    expect(measured!.lineHeight).toBe(LABEL_LINE_HEIGHT);

    // Visible gap = node top - glyph bottom, where glyph bottom is the box
    // bottom less the half-leading.
    const visible = box.y - measured!.bottom + measured!.halfLeading;
    expect(Math.round(visible)).toBe(LABEL_GAP);
  });

  test("the extension is stripped from an uploaded file name", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 800, 600, "photo-2024.final.png");
    const box = await imageBox(page);
    await page.mouse.click(box.x + 40, box.y + 40);
    await page.waitForTimeout(400);
    // Only the last segment is an extension.
    await expect(page.locator('div[title="photo-2024.final"]')).toHaveCount(1);
  });

  test("renaming commits, and an empty rename reverts", async ({ page }) => {
    await openBoard(page);
    await uploadImage(page, 800, 600, "harbour.png");
    const box = await imageBox(page);
    await page.mouse.click(box.x + 40, box.y + 40);
    await page.waitForTimeout(400);

    await page.locator('div[title="harbour"]').first().dblclick();
    await page.waitForTimeout(300);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("harbour wall");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await expect(page.locator('div[title="harbour wall"]')).toHaveCount(1);

    // Every reference needs a name -- it is how the model tells them apart --
    // so clearing the field reverts rather than leaving the node unnamed.
    await page.locator('div[title="harbour wall"]').first().dblclick();
    await page.waitForTimeout(300);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await expect(page.locator('div[title="harbour wall"]')).toHaveCount(1);
  });
});
