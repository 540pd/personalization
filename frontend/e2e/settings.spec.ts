import { test, expect, type Page } from "@playwright/test";
import { openBoard, panelBoxes, dragFrom, uploadImage, imageBox, setZoom, type Box } from "./helpers";
import { PORT_FRACTION } from "../src/constants/canvas.constants";

// Settings (#214): opened from the user menu or ⌘,, a page over the board,
// and Connection style -- how every link is drawn.

async function openSettings(page: Page) {
  await page.locator(".sidebar-identity").click();
  await page.getByRole("menuitem", { name: /Settings/ }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
}

/** Adds an Image node; its panel stays open unless `close`. */
async function addImageNode(page: Page, close = true) {
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForTimeout(250);
  await page.locator(".floating-dock-submenu button").filter({ hasText: /^Image$/ }).first().click();
  await page.waitForTimeout(400);
  if (close) await page.keyboard.press("Escape");
}

/** An uploaded image wired into an Image node. */
async function boardWithLink(page: Page) {
  await uploadImage(page, 200, 150);
  const img = await imageBox(page);
  await addImageNode(page);
  const target = (await panelBoxes(page))[0];
  await dragFrom(page, target.x + target.w / 2, target.y + target.h / 2, 260, 120);
  const moved: Box = (await panelBoxes(page))[0];
  await page.mouse.move(img.x + img.w + 2, img.y + img.h * PORT_FRACTION);
  await page.mouse.down();
  await page.mouse.move(moved.x + 2, moved.y + moved.h * 0.3, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.locator('path[stroke-width="12"]')).toHaveCount(1);
}

/** The drawn wire's shape, read from its path. */
async function linkShape(page: Page): Promise<"curve" | "straight" | "elbow"> {
  const d = (await page.locator('path[stroke-width="12"]').first().getAttribute("d")) ?? "";
  if (d.includes(" C ")) return "curve";
  return (d.match(/ L /g) ?? []).length === 1 ? "straight" : "elbow";
}

test.describe("Settings", () => {
  test("opens from the user menu over the board, and Playspace goes back", async ({ page }) => {
    await openBoard(page);
    await page.locator(".sidebar-identity").click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText([/Brand/, /Settings/, /Sign out/]);
    await menu.getByRole("menuitem", { name: /Settings/ }).click();

    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await expect(page.locator(".sidebar-product")).toHaveText(/Studio\s*\/\s*Settings/);
    await expect(page.getByRole("heading", { name: "Canvas", level: 2 })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Curve" })).toBeChecked();
    await expect(page.getByRole("button", { name: "Reset to defaults" })).toBeDisabled();
    // The board is still there underneath.
    expect(await page.evaluate(() => (window as any).Konva.stages.length)).toBe(1);

    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toHaveCount(0);
  });

  test("⌘, opens Settings, but not while typing or under a dialog", async ({ page }) => {
    await openBoard(page);
    await page.keyboard.press("Meta+Comma");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    await page.locator(".sidebar-item", { hasText: "Skills" }).click();
    // Skills is empty here: its Upload dialog is the dialog case.
    await page.getByRole("button", { name: "Upload skill" }).click();
    await page.keyboard.press("Control+Comma");
    await expect(page.getByRole("heading", { name: "Skills", level: 1 })).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await addImageNode(page, false);
    const field = page.locator("textarea").first();
    await field.click();
    await page.keyboard.press("Meta+Comma");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toHaveCount(0);
  });

  test("Connection style redraws every link, and is kept after a reload", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await openBoard(page);
    await page.evaluate(() => localStorage.removeItem("gcos-settings"));
    await openBoard(page);
    await boardWithLink(page);
    expect(await linkShape(page)).toBe("curve");

    await openSettings(page);
    await page.getByText("Elbow", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "Elbow" })).toBeChecked();
    await expect(page.getByRole("button", { name: "Reset to defaults" })).toBeEnabled();
    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    expect(await linkShape(page)).toBe("elbow");
    for (const z of [0.5, 1.5, 1]) {
      await setZoom(page, z);
      expect(await linkShape(page)).toBe("elbow");
    }

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("gcos-settings")!));
    expect(stored).toEqual({ version: 1, settings: { linkStyle: "link-elbow", showNodeNames: true } });

    // Arrow keys move the choice.
    await openSettings(page);
    await page.getByRole("radio", { name: "Elbow" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("radio", { name: "Straight" })).toBeChecked();

    await page.reload({ waitUntil: "networkidle" });
    await openSettings(page);
    await expect(page.getByRole("radio", { name: "Straight" })).toBeChecked();

    await page.getByRole("button", { name: "Reset to defaults" }).click();
    await expect(page.getByRole("radio", { name: "Curve" })).toBeChecked();
    await expect(page.getByRole("status")).toContainText("Settings reset to defaults");
    await expect(page.getByRole("button", { name: "Reset to defaults" })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test("an armed link tool still draws links in its own style", async ({ page }) => {
    await openBoard(page);
    await page.evaluate(() =>
      localStorage.setItem("gcos-settings", JSON.stringify({ version: 1, settings: { linkStyle: "link-elbow" } })),
    );
    await openBoard(page);
    await boardWithLink(page);
    expect(await linkShape(page)).toBe("elbow");

    await page.locator(".floating-dock-tool-wrapper", { hasText: "Links" }).locator("button").first().click();
    await page.locator(".floating-dock-submenu button", { hasText: "Straight" }).click();
    expect(await linkShape(page)).toBe("straight");
    // Put away, links go back to the chosen style; the setting is untouched.
    await page.keyboard.press("v");
    expect(await linkShape(page)).toBe("elbow");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("gcos-settings")!));
    expect(stored.settings.linkStyle).toBe("link-elbow");
  });

  test("unreadable or unknown stored settings fall back to the defaults", async ({ page }) => {
    await openBoard(page);
    await page.evaluate(() =>
      localStorage.setItem("gcos-settings", JSON.stringify({ version: 1, settings: { linkStyle: "zigzag", extra: 1 } })),
    );
    await openBoard(page);
    await openSettings(page);
    await expect(page.getByRole("radio", { name: "Curve" })).toBeChecked();
  });

  test("a refused write says so and the choice goes back", async ({ page }) => {
    await openBoard(page);
    await page.evaluate(() => localStorage.removeItem("gcos-settings"));
    await openBoard(page);
    await openSettings(page);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("quota", "QuotaExceededError");
      };
    });
    await page.getByText("Straight", { exact: true }).click();
    await expect(page.locator(".board-toast[role=alert]")).toContainText("Couldn't save the setting.");
    await expect(page.getByRole("radio", { name: "Curve" })).toBeChecked();
  });

  test("signed out, the identity row opens a menu with Settings", async ({ page }) => {
    await openBoard(page);
    await page.locator(".sidebar-identity").click();
    await page.getByRole("menuitem", { name: /Sign out/ }).click();
    await page.locator(".sidebar-identity").click();
    const menu = page.getByRole("menu");
    await expect(menu).toContainText("Not signed in");
    await expect(menu.getByRole("menuitem")).toHaveText([/Settings/]);
    await menu.getByRole("menuitem", { name: /Settings/ }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  });
});
