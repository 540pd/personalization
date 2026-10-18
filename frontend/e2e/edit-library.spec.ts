import { test, expect, type Page } from "@playwright/test";
import { openBoard } from "./helpers";

// Edit skills and agents (#210): rows open Edit, ⋯ → Edit…, Save changes.

const skill = (id: string, name: string, tags: string[] = []) => ({
  id, name, description: `${name} description`, tags, fileName: `${id}.md`, size: 9, content: `# ${name}`, createdAt: 1,
});

async function seed(page: Page) {
  await openBoard(page);
  await page.evaluate(
    ({ skills, agents }) => {
      localStorage.setItem("gcos-skills", JSON.stringify({ version: 1, skills }));
      localStorage.setItem("gcos-agents", JSON.stringify({ version: 1, agents }));
    },
    {
      skills: [skill("s1", "Brand voice", ["brand"]), skill("s2", "Campaign brief")],
      agents: [
        {
          id: "a1", name: "Copywriter", description: "Taglines", instructions: "Write three.",
          model: "gemini-3.8-flash", skillIds: ["s1", "gone"], tags: ["copy"],
          fileName: "copywriter.md", size: 30, content: "Write three.", createdAt: 1,
        },
        {
          id: "a2", name: "Summary editor", description: "Summaries", instructions: "Summarise.",
          model: "gemini-3.5-flash-lite", skillIds: [], tags: [],
          fileName: "summary.md", size: 10, content: "Summarise.", createdAt: 1,
        },
      ],
    },
  );
  await openBoard(page);
}

async function openSection(page: Page, label: "Skills" | "Agents") {
  await page.locator(".sidebar-item", { hasText: label }).click();
  await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
}

const row = (page: Page, name: string) => page.locator(".library-row", { hasText: name });

test.describe("Edit skills and agents", () => {
  test("a skill row opens Edit skill; saving a rename updates agents", async ({ page }) => {
    await seed(page);
    await openSection(page, "Skills");
    await row(page, "Brand voice").click();
    await expect(page.getByRole("dialog", { name: "Edit skill" })).toBeVisible();
    const save = page.getByRole("button", { name: "Save changes" });
    await expect(save).toBeDisabled();

    const nameField = page.getByLabel("Name", { exact: true });
    await nameField.fill("Campaign brief");
    await expect(page.locator(".library-field-error").first()).toHaveText("You already have a skill called “Campaign brief”");
    await expect(save).toBeDisabled();
    await nameField.fill("Brand voice");
    await expect(save).toBeDisabled();
    await nameField.fill("Tone of voice");
    await expect(save).toBeEnabled();
    await save.click();

    await expect(page.getByRole("status")).toContainText("Tone of voice saved");
    await expect(page.locator(".library-cell-name")).toHaveText(["Campaign brief", "Tone of voice"]);
    await openSection(page, "Agents");
    await expect(row(page, "Copywriter").locator(".library-skill-ref")).toHaveText(["Tone of voice"]);
  });

  test("Replace file swaps the file on save, keeping name and description", async ({ page }) => {
    await seed(page);
    await openSection(page, "Skills");
    await row(page, "Brand voice").click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Replace file…" }).click();
    await (await chooser).setFiles({ name: "voice-v2.md", mimeType: "text/markdown", buffer: Buffer.from("# Other title\nNew.") });
    await expect(page.locator(".library-file-meta")).toContainText("replaces s1.md when you save");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Brand voice");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(row(page, "Brand voice")).toContainText("voice-v2.md");
  });

  test("the ⋯ menu opens Edit agent; Replace file takes its model and skills, not its name", async ({ page }) => {
    await seed(page);
    await openSection(page, "Agents");
    const copywriter = row(page, "Copywriter");
    await copywriter.hover();
    await copywriter.getByRole("button", { name: "Copywriter options" }).click();
    await page.getByRole("menuitem", { name: "Edit…" }).click();

    await expect(page.getByRole("dialog", { name: "Edit agent" })).toBeVisible();
    // The missing skill id is not counted.
    await expect(page.locator(".library-file-meta")).toHaveText(/Gemini 3\.8 Flash · 1 skill$/);
    await expect(page.getByLabel("Instructions")).toHaveCount(0);

    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Replace file…" }).click();
    await (await chooser).setFiles({
      name: "copywriter-v2.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("---\nname: Other name\nmodel: gemini-3.5-flash-lite\nskills: [Brand voice, Campaign brief, Tone guide]\n---\nWrite five."),
    });
    await expect(page.locator(".library-file-meta")).toHaveText(
      /Gemini 3\.5 Flash Lite · 2 skills · replaces copywriter\.md when you save/,
    );
    await expect(page.locator(".library-field-note")).toHaveText(["Tone guide isn't in your skills, so it's skipped."]);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Copywriter");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toContainText("Your changes to Copywriter won't be saved.");
    await page.getByRole("button", { name: "Keep editing" }).click();

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("Copywriter saved");
    await expect(copywriter.getByRole("button", { name: "Copywriter options" })).toBeFocused();
    await expect(copywriter).toContainText("copywriter-v2.md · Gemini 3.5 Flash Lite");

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gcos-agents")!).agents[0]);
    expect(saved).toMatchObject({
      id: "a1",
      name: "Copywriter",
      instructions: "Write five.",
      model: "gemini-3.5-flash-lite",
      skillIds: ["s1", "s2"],
      fileName: "copywriter-v2.md",
    });
  });

  test("keyboard: Enter on a row opens Edit, Esc without changes closes it", async ({ page }) => {
    await seed(page);
    await openSection(page, "Agents");
    await row(page, "Summary editor").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Edit agent" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row(page, "Summary editor")).toBeFocused();
  });
});
