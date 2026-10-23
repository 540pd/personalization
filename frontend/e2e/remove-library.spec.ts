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
      skills: [skill("s1", "brand-voice"), skill("s2", "campaign-brief"), skill("s3", "product-photo")],
      agents: [
        agent("a1", "copywriter", ["s1", "s2"]),
        agent("a2", "social-planner", ["s1"]),
        agent("a3", "summary-editor", []),
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
    const skillRow = page.locator(".library-row", { hasText: "brand-voice" });
    await skillRow.hover();
    await skillRow.getByRole("button", { name: "brand-voice options" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Edit…", "Remove…"]);
    await page.keyboard.press("Escape");

    await openSection(page, "Agents");
    const agentRow = page.locator(".library-row", { hasText: "copywriter" });
    await agentRow.hover();
    await agentRow.getByRole("button", { name: "copywriter options" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Edit…", "Duplicate", "Remove…"]);
  });

  test("removing a skill names the agents using it; Undo brings it back to them", async ({ page }) => {
    await seed(page);
    await openSection(page, "Skills");
    await menu(page, "brand-voice", "Remove…");
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText("Remove “brand-voice”?");
    await expect(confirm).toContainText("copywriter and social-planner use it. They'll stop using it.");
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.getByRole("button", { name: "Remove", exact: true }).click();

    await expect(page.locator(".library-cell-name")).toHaveText(["campaign-brief", "product-photo"]);
    await expect(page.getByRole("status")).toContainText("brand-voice removed");
    // Focus on the next row's ⋯.
    await expect(page.getByRole("button", { name: "campaign-brief options" })).toBeFocused();

    await openSection(page, "Agents");
    await expect(page.locator(".library-row", { hasText: "copywriter" }).locator(".library-skill-ref")).toHaveText([
      "campaign-brief",
    ]);
    await openSection(page, "Skills");
    await menu(page, "product-photo", "Remove…");
    await expect(page.getByRole("alertdialog")).toContainText("It will be removed from your skills.");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".library-cell-name")).toHaveCount(2);
  });

  test("Undo restores the item exactly, and only the latest removal", async ({ page }) => {
    await seed(page);
    await openSection(page, "Agents");
    await menu(page, "copywriter", "Remove…");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await menu(page, "summary-editor", "Remove…");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    // The last row went: focus moves to the one before it.
    await expect(page.getByRole("button", { name: "social-planner options" })).toBeFocused();
    await expect(page.getByRole("status")).toContainText("summary-editor removed");
    await page.getByRole("button", { name: "Undo" }).click();

    await expect(page.locator(".library-cell-name")).toHaveText(["social-planner", "summary-editor"]);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("gcos-agents")!).agents);
    expect(stored.map((a: { id: string }) => a.id)).toEqual(["a2", "a3"]);
    expect(stored[1]).toMatchObject({ id: "a3", name: "summary-editor", fileName: "a3.md" });
  });

  test("removing the last item shows the empty state with focus on its button", async ({ page }) => {
    await openBoard(page);
    await page.evaluate((s) => localStorage.setItem("gcos-skills", JSON.stringify({ version: 1, skills: [s] })), skill("s1", "only"));
    await openBoard(page);
    await openSection(page, "Skills");
    await menu(page, "only", "Remove…");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText("No skills yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload skill" })).toBeFocused();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".library-cell-name")).toHaveText(["only"]);
  });

  test("Duplicate copies an agent as -copy, then -copy-2", async ({ page }) => {
    await seed(page);
    await openSection(page, "Agents");
    await menu(page, "copywriter", "Duplicate");
    await expect(page.getByRole("status")).toContainText("copywriter-copy created");
    await menu(page, "copywriter", "Duplicate");
    await expect(page.locator(".library-cell-name")).toHaveText([
      "copywriter",
      "copywriter-copy",
      "copywriter-copy-2",
      "social-planner",
      "summary-editor",
    ]);
    const copy = page.locator(".library-row", { hasText: "copywriter-copy-2" });
    await expect(copy.locator(".library-skill-ref")).toHaveText(["brand-voice", "campaign-brief"]);
    await expect(copy).toContainText("a1.md · Gemini 3.8 Flash");
  });
});
