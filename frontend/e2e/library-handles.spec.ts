import { test, expect, type Page } from "@playwright/test";
import { openBoard } from "./helpers";

// Names as handles (#237): lower case, digits and single hyphens, so a prompt
// can reference a skill or agent without quotes.

const HINT = "Lowercase letters, numbers and hyphens, so it's easy to reference in a prompt";

const skill = (id: string, name: string, fileName = `${id}.md`) => ({
  id, name, description: `${id} description`, tags: [], fileName, size: 9, content: "# Skill", createdAt: 1,
});

async function seedSkills(page: Page, skills: ReturnType<typeof skill>[]) {
  await openBoard(page);
  await page.evaluate((list) => {
    localStorage.setItem("gcos-skills", JSON.stringify({ version: 1, skills: list }));
  }, skills);
  await openBoard(page);
}

async function openSection(page: Page, label: "Skills" | "Agents") {
  await page.locator(".sidebar-item", { hasText: label }).click();
  await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
}

async function chooseFile(page: Page, name: string, text: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a \.md file/ }).click();
  await (await chooser).setFiles({ name, mimeType: "text/markdown", buffer: Buffer.from(text) });
}

test.describe("Names as handles (#237)", () => {
  test("typing converts to a handle, under a hint; symbols alone are no name", async ({ page }) => {
    await openBoard(page);
    await openSection(page, "Skills");
    await page.getByRole("button", { name: "Upload skill" }).first().click();
    await chooseFile(page, "notes.md", "---\ndescription: Warm copy\n---\nBody");

    const name = page.getByLabel("Name", { exact: true });
    await expect(name).toHaveValue("notes");
    await expect(page.locator(".library-field-hint").first()).toHaveText(HINT);

    await name.fill("");
    await name.pressSequentially("Brand Voice!");
    await expect(name).toHaveValue("brand-voice");
    await name.fill("Café Crème");
    await expect(name).toHaveValue("cafe-creme");

    await name.fill("!?");
    await expect(name).toHaveValue("");
    await name.blur();
    await expect(page.locator(".library-field-error").first()).toHaveText("Enter a name");
    await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeDisabled();

    // A hyphen typed at the end is dropped on save.
    await name.fill("Tone ");
    await expect(name).toHaveValue("tone-");
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.locator(".library-cell-name")).toHaveText(["tone"]);
  });

  test("a file's name, heading or file name is prefilled as a handle", async ({ page }) => {
    await openBoard(page);
    await openSection(page, "Skills");
    const name = page.getByLabel("Name", { exact: true });
    const cases: [string, string, string][] = [
      ["x.md", "---\nname: Brand Voice\n---\nBody", "brand-voice"],
      ["x.md", "# Product Photography\nBody", "product-photography"],
      ["brand_voice.md", "Body only", "brand-voice"],
    ];
    for (const [file, text, expected] of cases) {
      await page.getByRole("button", { name: "Upload skill" }).first().click();
      await chooseFile(page, file, text);
      await expect(name).toHaveValue(expected);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });

  test("skills saved before #237 load as handles; a clash gets -2; an empty name its file name", async ({ page }) => {
    await seedSkills(page, [
      skill("s1", "Brand voice"),
      skill("s2", "brand VOICE"),
      skill("s3", "日本", "tone_guide.md"),
    ]);
    await openSection(page, "Skills");
    await expect(page.locator(".library-cell-name")).toHaveText(["brand-voice", "brand-voice-2", "tone-guide"]);

    await page.getByLabel("Search skills").fill("voice");
    await expect(page.locator(".library-cell-name")).toHaveText(["brand-voice", "brand-voice-2"]);
    await page.getByLabel("Search skills").fill("s3 description");
    await expect(page.locator(".library-cell-name")).toHaveText(["tone-guide"]);
  });

  test("Edit shows the hint, and another skill's name as taken however it's typed", async ({ page }) => {
    await seedSkills(page, [skill("s1", "brand-voice"), skill("s2", "campaign-brief")]);
    await openSection(page, "Skills");
    await page.locator(".library-row", { hasText: "brand-voice" }).click();
    await expect(page.locator(".library-field-hint").first()).toHaveText(HINT);
    const name = page.getByLabel("Name", { exact: true });
    await name.fill("Campaign Brief");
    await expect(name).toHaveValue("campaign-brief");
    await expect(page.locator(".library-field-error").first()).toHaveText("You already have a skill called “campaign-brief”");
  });

  test("Upload agent shows the hint and converts its file's name", async ({ page }) => {
    await openBoard(page);
    await openSection(page, "Agents");
    await page.getByRole("button", { name: "Upload agent" }).first().click();
    await chooseFile(page, "a.md", "---\nname: Headline Writer\ndescription: Lines\n---\nWrite.");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("headline-writer");
    await expect(page.locator(".library-field-hint").first()).toHaveText(HINT);
  });
});
