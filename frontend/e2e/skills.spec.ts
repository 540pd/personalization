import { test, expect, type Page } from "@playwright/test";
import { openBoard, addPanel, setZoom } from "./helpers";

// The Skills page (#206): rail → Skills, a table of skills, Upload skill.

const BRAND_VOICE = "---\nname: Brand voice\ndescription: Warm, direct copy\n---\n# Tone\nSpeak to one reader.\n";

async function openSkills(page: Page) {
  await page.locator(".sidebar-item", { hasText: "Skills" }).click();
  await expect(page.getByRole("heading", { name: "Skills", level: 1 })).toBeVisible();
}

/** Opens Upload skill and picks a file through the system chooser. */
async function chooseSkillFile(page: Page, name: string, text: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a \.md file/ }).click();
  await (await chooser).setFiles({ name, mimeType: "text/markdown", buffer: Buffer.from(text) });
}

async function uploadSkill(page: Page, name: string, text: string, tags: string[] = []) {
  await page.getByRole("button", { name: "Upload skill" }).first().click();
  await chooseSkillFile(page, name, text);
  await expect(page.getByLabel("Name", { exact: true })).not.toHaveValue("");
  const description = page.getByLabel("Description", { exact: true });
  if (!(await description.inputValue())) await description.fill("Test skill");
  for (const tag of tags) {
    await page.getByLabel(/Tags/).fill(tag);
    await page.getByLabel(/Tags/).press("Enter");
  }
  await page.getByRole("button", { name: "Upload", exact: true }).click();
}

test.describe("Skills page", () => {
  test("opens from the rail and returns to the board as it was", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await setZoom(page, 1.5);
    const zoomBefore = await page.evaluate(() => (window as any).Konva.stages[0].scaleX());

    await openSkills(page);
    await expect(page.locator(".sidebar-product")).toContainText("Studio / Skills");
    await expect(page.locator(".sidebar-item-active")).toContainText("Skills");
    await expect(page.getByText("No skills yet")).toBeVisible();
    // The dock is under the page, not reachable.
    await expect(page.locator(".library-page")).toBeVisible();

    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await expect(page.locator(".library-page")).toHaveCount(0);
    await expect(page.locator("button.node-panel-placeholder")).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).Konva.stages[0].scaleX())).toBeCloseTo(zoomBefore, 5);
  });

  test("board shortcuts do nothing while the page is shown", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await page.keyboard.press("ControlOrMeta+a");
    await openSkills(page);
    await page.keyboard.press("Delete");
    await page.keyboard.press("ControlOrMeta+z");
    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await expect(page.locator("button.node-panel-placeholder")).toHaveCount(1);
  });

  test("uploads a skill with front matter and tags, and keeps it across a reload", async ({ page }) => {
    await openBoard(page);
    await openSkills(page);
    await page.getByRole("button", { name: "Upload skill" }).click();
    await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeDisabled();

    await chooseSkillFile(page, "brand-voice.md", BRAND_VOICE);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("brand-voice");
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Warm, direct copy");

    const tags = page.getByLabel(/Tags/);
    await tags.fill("Brand");
    await tags.press("Enter");
    await tags.fill("copy,");
    await expect(page.locator(".library-tag-chip")).toHaveText(["brand", "copy"]);
    await tags.press("Backspace");
    await expect(page.locator(".library-tag-chip")).toHaveText(["brand"]);

    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("brand-voice added");
    const row = page.locator(".library-table tbody tr");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("brand-voice");
    await expect(row).toContainText("brand-voice.md");
    await expect(row).toContainText("Warm, direct copy");
    await expect(row).toContainText("brand");

    await openBoard(page);
    await openSkills(page);
    await expect(page.locator(".library-table tbody tr")).toHaveCount(1);
  });

  test("rejects a file that is not markdown, and names it", async ({ page }) => {
    await openBoard(page);
    await openSkills(page);
    await page.getByRole("button", { name: "Upload skill" }).click();
    await chooseSkillFile(page, "notes.pdf", "x");
    await expect(page.locator(".library-field-error[role=alert]")).toHaveText("notes.pdf isn't a markdown file");
    await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Upload skill" })).toBeFocused();
  });

  test("a second skill with the same name can be kept as a copy", async ({ page }) => {
    await openBoard(page);
    await openSkills(page);
    await uploadSkill(page, "brand-voice.md", BRAND_VOICE);
    await uploadSkill(page, "brand-voice.md", BRAND_VOICE);
    await expect(page.getByRole("alertdialog")).toContainText("Replace “brand-voice”?");
    await page.getByRole("button", { name: "Keep both" }).click();
    await expect(page.locator(".library-cell-name")).toHaveText(["brand-voice", "brand-voice-2"]);
  });

  test("searches and filters by tag", async ({ page }) => {
    await openBoard(page);
    await openSkills(page);
    await uploadSkill(page, "brand-voice.md", BRAND_VOICE, ["brand"]);
    await uploadSkill(page, "photo.md", "# Product photography\nStudio light.", ["image"]);
    await expect(page.locator(".library-cell-name")).toHaveText(["brand-voice", "product-photography"]);

    await page.getByRole("button", { name: "image", exact: true }).click();
    await expect(page.locator(".library-cell-name")).toHaveText(["product-photography"]);
    await expect(page.locator(".library-count")).toHaveText("1 skill");

    await page.getByLabel("Search skills").fill("warm");
    await expect(page.getByText("No skills match")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator(".library-count")).toHaveText("2 skills");
  });
});
