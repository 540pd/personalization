import { test, expect, type Page } from "@playwright/test";
import { openBoard, reloadBoard, setZoom } from "./helpers";

// Menu visibility (#404): Settings chooses which items the dock's Create and
// Shapes menus offer. Image has no switch; with every shape off there is no
// Shapes button at all.

const createBtn = (page: Page) => page.getByRole("button", { name: "Create", exact: true });
const shapesBtn = (page: Page) => page.getByRole("button", { name: "Shapes", exact: true });
const menuItems = (page: Page) => page.locator(".floating-dock-submenu button");

async function openSettings(page: Page) {
  await page.locator(".sidebar-identity").click();
  await page.getByRole("menuitem", { name: /Settings/ }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
}

async function backToBoard(page: Page) {
  await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toHaveCount(0);
}

/** The open menu's labels, with "|" for a divider. */
async function menuOf(page: Page, button: ReturnType<typeof createBtn>): Promise<string[]> {
  await button.click();
  await expect(menuItems(page).first()).toBeVisible();
  const order = await page.locator(".floating-dock-submenu").first().evaluate((menu) =>
    [...menu.querySelectorAll("button, [role=separator]")].map((el) =>
      el.getAttribute("role") === "separator"
        ? "|"
        : ([...el.querySelectorAll("span")].find((s) => !s.className.includes("shortcut") && s.textContent)?.textContent ?? "").trim(),
    ),
  );
  await page.keyboard.press("Escape");
  return order;
}

const SHAPES = ["Rectangle", "Arrow", "Line", "Ellipse", "Triangle", "Block Arrow", "Diamond"];

test.describe("Menu visibility settings", () => {
  test("the menus start with the requested defaults", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openBoard(page);

    expect(await menuOf(page, createBtn(page))).toEqual(["Image", "Prompt", "|", "Compose"]);
    expect(await menuOf(page, shapesBtn(page))).toEqual(["Rectangle", "Arrow", "Diamond"]);

    await openSettings(page);
    await expect(page.getByRole("heading", { name: "Create menu", level: 2 })).toBeVisible();
    await expect(page.getByText("3 of 4 shown")).toBeVisible();
    await expect(page.getByText("3 of 7 shown")).toBeVisible();
    await expect(page.getByRole("switch", { name: "Image" })).toHaveCount(0);
    for (const [name, on] of [["Video", false], ["Prompt", true], ["Compose", true]] as const) {
      await expect(page.getByRole("switch", { name, exact: true })).toHaveAttribute("aria-checked", String(on));
    }
    for (const name of SHAPES) {
      const on = ["Rectangle", "Arrow", "Diamond"].includes(name);
      await expect(page.getByRole("switch", { name, exact: true })).toHaveAttribute("aria-checked", String(on));
    }
    // A hidden item's row is greyed; a shown one's is not.
    await expect(page.locator('[data-setting="showVideo"]')).toHaveClass(/is-off/);
    await expect(page.locator('[data-setting="showPrompt"]')).not.toHaveClass(/is-off/);
    // The Canvas group is still first and unchanged.
    await expect(page.locator(".settings-group-title").first()).toHaveText("Canvas");
    await expect(page.getByRole("button", { name: "Reset to defaults" })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test("a switch changes its menu at once, keeps across a reload, and Reset puts it back", async ({ page }) => {
    await openBoard(page);
    await openSettings(page);
    await page.getByRole("switch", { name: "Video", exact: true }).click();
    await page.getByRole("switch", { name: "Compose", exact: true }).click();
    await page.getByRole("switch", { name: "Line", exact: true }).click();
    await page.getByRole("switch", { name: "Rectangle", exact: true }).click();
    await expect(page.getByText("3 of 4 shown")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset to defaults" })).toBeEnabled();
    await backToBoard(page);

    // Compose hidden: no divider either.
    expect(await menuOf(page, createBtn(page))).toEqual(["Video", "Image", "Prompt"]);
    expect(await menuOf(page, shapesBtn(page))).toEqual(["Arrow", "Line", "Diamond"]);

    await reloadBoard(page);
    expect(await menuOf(page, createBtn(page))).toEqual(["Video", "Image", "Prompt"]);

    await openSettings(page);
    await page.getByRole("button", { name: "Reset to defaults" }).click();
    await expect(page.getByRole("switch", { name: "Video", exact: true })).toHaveAttribute("aria-checked", "false");
    await backToBoard(page);
    expect(await menuOf(page, createBtn(page))).toEqual(["Image", "Prompt", "|", "Compose"]);
  });

  test("with every shape off the Shapes button and its keys are gone, and come back with one", async ({ page }) => {
    await openBoard(page);
    await openSettings(page);
    for (const name of ["Rectangle", "Arrow", "Diamond"]) {
      await page.getByRole("switch", { name, exact: true }).click();
    }
    await expect(page.getByText("0 of 7 shown")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Shapes button is hidden" })).toBeVisible();
    await backToBoard(page);

    await expect(shapesBtn(page)).toHaveCount(0);
    for (const key of ["s", "r", "a"]) {
      await page.keyboard.press(key);
      await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
    }

    await openSettings(page);
    await page.getByRole("switch", { name: "Ellipse", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Shapes button is hidden" })).toHaveCount(0);
    await backToBoard(page);
    expect(await menuOf(page, shapesBtn(page))).toEqual(["Ellipse"]);
    // S arms the one shape on offer.
    await page.keyboard.press("s");
    await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "false");
  });

  test("hiding the armed shape returns the dock to the pointer", async ({ page }) => {
    await openBoard(page);
    await page.keyboard.press("r");
    await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "false");
    await openSettings(page);
    await page.getByRole("switch", { name: "Rectangle", exact: true }).click();
    await backToBoard(page);
    await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("r");
    await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("the switches work from the keyboard", async ({ page }) => {
    await openBoard(page);
    await openSettings(page);
    const video = page.getByRole("switch", { name: "Video", exact: true });
    await video.focus();
    await page.keyboard.press("Space");
    await expect(video).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Enter");
    await expect(video).toHaveAttribute("aria-checked", "false");
  });

  test("the menus are the same at 50%, 100% and 150% zoom", async ({ page }) => {
    await openBoard(page);
    for (const z of [0.5, 1.5, 1]) {
      await setZoom(page, z);
      expect(await menuOf(page, createBtn(page))).toEqual(["Image", "Prompt", "|", "Compose"]);
      expect(await menuOf(page, shapesBtn(page))).toEqual(["Rectangle", "Arrow", "Diamond"]);
    }
  });
});
