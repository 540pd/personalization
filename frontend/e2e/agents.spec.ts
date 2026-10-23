import { test, expect, type Page } from "@playwright/test";
import { openBoard, addPanel } from "./helpers";

// The Agents page (#208): rail → Agents, a table of agents, Upload agent.

const SKILLS = {
  version: 1,
  skills: [
    { id: "s1", name: "Brand voice", description: "Warm copy", tags: [], fileName: "b.md", size: 9, content: "# Brand", createdAt: 1 },
    { id: "s2", name: "Campaign brief", description: "Key messages", tags: [], fileName: "c.md", size: 9, content: "# Brief", createdAt: 1 },
  ],
};

const COPYWRITER = `---
name: Copywriter
description: Writes taglines
model: gemini-3.8-flash
skills: [Campaign brief, Brand voice]
tags: [copy]
---
Write three options under eight words.
`;

async function seedSkills(page: Page) {
  await page.evaluate((data) => localStorage.setItem("gcos-skills", JSON.stringify(data)), SKILLS);
}

async function openAgents(page: Page) {
  await page.locator(".sidebar-item", { hasText: "Agents" }).click();
  await expect(page.getByRole("heading", { name: "Agents", level: 1 })).toBeVisible();
}

async function chooseAgentFile(page: Page, name: string, text: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a \.md file/ }).click();
  await (await chooser).setFiles({ name, mimeType: "text/markdown", buffer: Buffer.from(text) });
}

async function uploadAgent(page: Page, name: string, text: string) {
  await page.getByRole("button", { name: "Upload agent" }).first().click();
  await chooseAgentFile(page, name, text);
  await expect(page.getByLabel("Name", { exact: true })).not.toHaveValue("");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
}

test.describe("Agents page", () => {
  test("opens from the rail, and the board is as it was on return", async ({ page }) => {
    await openBoard(page);
    await addPanel(page);
    await openAgents(page);
    await expect(page.locator(".sidebar-product")).toContainText("Studio / Agents");
    await expect(page.getByText("No agents yet")).toBeVisible();
    await page.keyboard.press("Delete");
    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await expect(page.locator(".library-page")).toHaveCount(0);
    await expect(page.locator("button.node-panel-placeholder")).toHaveCount(1);
  });

  test("uploads an agent file: model, skills and tags come from it, and it survives a reload", async ({ page }) => {
    await openBoard(page);
    await seedSkills(page);
    await openBoard(page);
    await openAgents(page);
    await page.getByRole("button", { name: "Upload agent" }).click();
    const upload = page.getByRole("button", { name: "Upload", exact: true });
    await expect(upload).toBeDisabled();

    await chooseAgentFile(page, "copywriter.md", COPYWRITER);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("copywriter");
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Writes taglines");
    await expect(page.locator(".library-tag-chip")).toHaveText(["copy"]);
    await expect(page.locator(".library-file-meta")).toHaveText(/Gemini 3\.8 Flash · 2 skills/);
    // Nothing to type for instructions, model or skills.
    await expect(page.getByLabel("Instructions")).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);

    await page.getByLabel("Name", { exact: true }).fill("Headline Writer");
    await upload.click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("headline-writer added");
    const row = page.locator(".library-table tbody tr");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("copywriter.md · Gemini 3.8 Flash");
    await expect(row.locator(".library-skill-ref")).toHaveText(["campaign-brief", "brand-voice"]);
    await expect(row.locator(".library-tag")).toHaveText(["copy"]);

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("gcos-agents")!).agents[0]);
    expect(saved).toMatchObject({
      name: "headline-writer",
      instructions: "Write three options under eight words.",
      model: "gemini-3.8-flash",
      skillIds: ["s2", "s1"],
    });

    await openBoard(page);
    await openAgents(page);
    await expect(page.locator(".library-table tbody tr")).toHaveCount(1);
  });

  test("a model or skill the app doesn't know is a note, not an error", async ({ page }) => {
    await openBoard(page);
    await openAgents(page);
    await page.getByRole("button", { name: "Upload agent" }).click();
    await chooseAgentFile(page, "planner.md", "---\nmodel: gemini-9\nskills: [Tone guide]\n---\n# Planner\nPlan posts.");
    await expect(page.locator(".library-field-note")).toHaveText([
      "Model gemini-9 isn't available, so Gemini 3.5 Flash Lite is used.",
      "Tone guide isn't in your skills, so it's skipped.",
    ]);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("planner");
    await page.getByLabel("Description", { exact: true }).fill("Plans posts");
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.locator(".library-table tbody tr")).toContainText("planner.md · Gemini 3.5 Flash Lite");
  });

  test("refuses a file with no instructions, and offers the example file", async ({ page }) => {
    await openBoard(page);
    await openAgents(page);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Example agent file" }).click();
    expect((await download).suggestedFilename()).toBe("agent-example.md");

    await page.getByRole("button", { name: "Upload agent" }).click();
    await chooseAgentFile(page, "empty.md", "---\nname: Nothing\n---\n   \n");
    await expect(page.locator(".library-field-error[role=alert]")).toHaveText("empty.md is empty");
    await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Upload agent" })).toBeFocused();
  });

  test("a duplicate name can be kept as a copy, and filters work", async ({ page }) => {
    await openBoard(page);
    await openAgents(page);
    await uploadAgent(page, "copywriter.md", COPYWRITER);
    await uploadAgent(page, "copywriter.md", COPYWRITER.replace("Writes taglines", "Second version"));
    await expect(page.getByRole("alertdialog")).toContainText("Replace “copywriter”?");
    await page.getByRole("button", { name: "Keep both" }).click();
    await expect(page.locator(".library-cell-name")).toHaveText(["copywriter", "copywriter-2"]);

    await page.getByLabel("Search agents").fill("second");
    await expect(page.locator(".library-count")).toHaveText("1 agent");
    await page.getByLabel("Search agents").fill("nothing like it");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator(".library-count")).toHaveText("2 agents");
  });
});
