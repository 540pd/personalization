import { test, expect, type Page } from "@playwright/test";
import { openBoard } from "./helpers";

// Remove skills and agents, and duplicate agents (#211).

const skill = (id: string, name: string) => ({
  id, name, description: `${name} description`, tags: [], fileName: `${id}.md`, size: 9, content: `# ${name}`, createdAt: 1,
});
const agent = (id: string, name: string, skillIds: string[]) => ({
  id, name, description: `${name} description`, instructions: "Write.", model: "gemini-3.8-flash", skillIds, tags: ["copy"],
  fileName: `${id}.md`, size: 6, content: "Write.", createdAt: 1,
});

async function seed(page: Page) {
  await openBoard(page);
  await page.evaluate(
    ({ skills, agents }) => {
      localStorage.setItem("gcos-skills", JSON.stringify({ version: 1, skills }));
      localStorage.setItem("gcos-agents", JSON.stringify({ version: 1, agents }));
    },
    {
      skills: [skill("s1", "Brand voice"), skill("s2", "Campaign brief"), skill("s3", "Product photo")],
      agents: [
        agent("a1", "Copywriter", ["s1", "s2"]),
        agent("a2", "Social planner", ["s1"]),
        agent("a3", "Summary editor", []),
      ],
    },
  );
  await openBoard(page);
}

async function openSection(page: Page, label: "Skills" | "Agents") {
  await page.locator(".sidebar-item", { hasText: label }).click();
  await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
}

async function menu(page: Page, name: string, item: string) {
  const row = page.locator(".library-row", { hasText: name }).first();
  await row.hover();
  await row.getByRole("button", { name: `${name} options` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test.describe("Remove and duplicate", () => {
  test("menus offer Edit, Remove on Skills and Edit, Duplicate, Remove on Agents", async ({ page }) => {
    await seed(page);
    await openSection(page, "Skills");
    const skillRow = page.locator(".library-row", { hasText: "Brand voice" });
    await skillRow.hover();
    await skillRow.getByRole("button", { name: "Brand voice options" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Edit…", "Remove…"]);
    await page.keyboard.press("Escape");

    await openSection(page, "Agents");
    const agentRow = page.locator(".library-row", { hasText: "Copywriter" });
    await agentRow.hover();
    await agentRow.getByRole("button", { name: "Copywriter options" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Edit…", "Duplicate", "Remove…"]);
  });

  test("removing a skill names the agents using it; Undo brings it back to them", async ({ page }) => {
    await seed(page);
    await openSection(page, "Skills");
    await menu(page, "Brand voice", "Remove…");
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText("Remove “Brand voice”?");
    await expect(confirm).toContainText("Copywriter and Social planner use it. They'll stop using it.");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.getByRole("button", { name: "Remove", exact: true }).click();

    await expect(page.locator(".library-cell-name")).toHaveText(["Campaign brief", "Product photo"]);
    await expect(page.getByRole("status")).toContainText("Brand voice removed");
    // Focus on the next row's ⋯.
    await expect(page.getByRole("button", { name: "Campaign brief options" })).toBeFocused();

    await openSection(page, "Agents");
    await expect(page.locator(".library-row", { hasText: "Copywriter" }).locator(".library-skill-ref")).toHaveText([
      "Campaign brief",
    ]);
    await openSection(page, "Skills");
    await menu(page, "Product photo", "Remove…");
    await expect(page.getByRole("alertdialog")).toContainText("It will be removed from your skills.");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".library-cell-name")).toHaveCount(2);
  });

  test("Undo restores the item exactly, and only the latest removal", async ({ page }) => {
    await seed(page);
    await openSection(page, "Agents");
    await menu(page, "Copywriter", "Remove…");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await menu(page, "Summary editor", "Remove…");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    // The last row went: focus moves to the one before it.
    await expect(page.getByRole("button", { name: "Social planner options" })).toBeFocused();
    await expect(page.getByRole("status")).toContainText("Summary editor removed");
    await page.getByRole("button", { name: "Undo" }).click();

    await expect(page.locator(".library-cell-name")).toHaveText(["Social planner", "Summary editor"]);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("gcos-agents")!).agents);
    expect(stored.map((a: { id: string }) => a.id)).toEqual(["a2", "a3"]);
    expect(stored[1]).toMatchObject({ id: "a3", name: "Summary editor", fileName: "a3.md" });
  });

  test("removing the last item shows the empty state with focus on its button", async ({ page }) => {
    await openBoard(page);
    await page.evaluate((s) => localStorage.setItem("gcos-skills", JSON.stringify({ version: 1, skills: [s] })), skill("s1", "Only"));
    await openBoard(page);
    await openSection(page, "Skills");
    await menu(page, "Only", "Remove…");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText("No skills yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload skill" })).toBeFocused();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".library-cell-name")).toHaveText(["Only"]);
  });

  test("Duplicate copies an agent as (copy), then (copy 2)", async ({ page }) => {
    await seed(page);
    await openSection(page, "Agents");
    await menu(page, "Copywriter", "Duplicate");
    await expect(page.getByRole("status")).toContainText("Copywriter (copy) created");
    await menu(page, "Copywriter", "Duplicate");
    // A–Z by name: "(copy 2)" sorts before "(copy)", as " " before ")".
    await expect(page.locator(".library-cell-name")).toHaveText([
      "Copywriter",
      "Copywriter (copy 2)",
      "Copywriter (copy)",
      "Social planner",
      "Summary editor",
    ]);
    const copy = page.locator(".library-row", { hasText: "Copywriter (copy 2)" });
    await expect(copy.locator(".library-skill-ref")).toHaveText(["Brand voice", "Campaign brief"]);
    await expect(copy).toContainText("a1.md · Gemini 3.8 Flash");
  });
});
