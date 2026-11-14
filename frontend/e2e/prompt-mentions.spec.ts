import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, setZoom } from "./helpers";

// @ in a Prompt panel's Instruction (#239): pick a skill or agent from the
// menu; on Create its instructions travel with the prompt.

const skills = [
  { id: "s1", name: "brand-voice", description: "Warm, direct copy", tags: [], fileName: "b.md", size: 9, content: "---\nname: brand-voice\n---\nWarm, direct.", createdAt: 1 },
  { id: "s2", name: "campaign-brief", description: "Key messages", tags: [], fileName: "c.md", size: 9, content: "Spring launch.", createdAt: 1 },
  { id: "s3", name: "tone", description: "Calm", tags: [], fileName: "t.md", size: 9, content: "Calm.", createdAt: 1 },
];
const agents = [
  {
    id: "a1", name: "copywriter", description: "Writes on-brand taglines", instructions: "Write three options.",
    model: "gemini-3.8-flash", skillIds: ["s3"], tags: [], fileName: "copywriter.md", size: 30, content: "Write three options.", createdAt: 1,
  },
];

async function seed(page: Page, library = { skills, agents }) {
  await openBoard(page);
  await page.evaluate(({ skills, agents }) => {
    localStorage.setItem("gcos-skills", JSON.stringify({ version: 1, skills }));
    localStorage.setItem("gcos-agents", JSON.stringify({ version: 1, agents }));
  }, library);
  await openBoard(page);
}

/** Records text requests and answers them, so Create needs no backend. */
async function stubText(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/proxy/generate/text", async (route: Route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "j", status: "done", text: "Three taglines.", modelUsed: "gemini-3.8-flash" }),
    });
  });
  return bodies;
}

async function addNode(page: Page, label: RegExp) {
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForTimeout(250);
  await page.locator(".floating-dock-submenu button").filter({ hasText: label }).first().click();
  await expect(page.locator(".node-panel-instruction.mention-textarea, textarea.node-panel-instruction").first()).toBeVisible();
}

const box = (page: Page) => page.locator("textarea.node-panel-instruction");
const menu = (page: Page) => page.getByRole("listbox", { name: "Skills and agents" });
const options = (page: Page) => menu(page).locator(".mention-menu-name");

test.describe("Prompt panel: @ skills and agents (#239)", () => {
  test("@ opens the menu under it; typing narrows; Enter inserts and tints", async ({ page }) => {
    await seed(page);
    await addNode(page, /^Prompt$/);
    await box(page).click();
    await box(page).pressSequentially("Taglines in @");
    await expect(options(page)).toHaveText(["brand-voice", "campaign-brief", "tone", "copywriter"]);

    // Under the @, not somewhere else on the page.
    const field = (await box(page).boundingBox())!;
    const m = (await menu(page).boundingBox())!;
    expect(m.y).toBeGreaterThan(field.y);
    expect(m.x).toBeGreaterThan(field.x + 40);

    // On handle or description: copywriter "Writes on-brand taglines".
    await box(page).pressSequentially("br");
    await expect(options(page)).toHaveText(["brand-voice", "campaign-brief", "copywriter"]);
    await box(page).press("Enter");
    await expect(box(page)).toHaveValue("Taglines in @brand-voice ");
    await expect(menu(page)).toHaveCount(0);
    await expect(page.locator(".mention-known")).toHaveText(["@brand-voice"]);

    // No menu inside a word.
    await box(page).pressSequentially("mail a@b");
    await expect(menu(page)).toHaveCount(0);
  });

  test("an @ that wraps to a new line opens the menu under it, not at the line above's end", async ({ page }) => {
    await seed(page);
    await addNode(page, /^Prompt$/);
    await box(page).click();
    // Sized to the field: the words fit line 1 and the @ does not, in Inter at
    // 13px (#436). A change to the field's font or width means re-measuring it.
    await box(page).pressSequentially("Three taglines for the spring launch, via @");
    const field = (await box(page).boundingBox())!;
    const anchor = (await page.locator(".mention-mirror span").first().boundingBox())!;
    const m = (await menu(page).boundingBox())!;
    // The @ starts line 2, at the field's left padding.
    expect(anchor.x - field.x).toBeLessThan(20);
    expect(Math.abs(m.x - anchor.x)).toBeLessThan(2);
    expect(m.y).toBeGreaterThan(anchor.y + anchor.height);
  });

  test("picking an agent switches the model; Create sends its instructions and the skills", async ({ page }) => {
    const bodies = await stubText(page);
    await seed(page);
    await addNode(page, /^Prompt$/);
    await box(page).click();
    await box(page).pressSequentially("@cop");
    await menu(page).getByRole("option", { name: /copywriter/ }).click();
    await box(page).pressSequentially("taglines in @brand-voice");
    await expect(page.locator(".node-panel-model-trigger")).toHaveText("Gemini 3.8 Flash · from @copywriter");
    // The menu is still open on the typed handle; where it lands depends on
    // the fonts, and on Linux it covers Create.
    await box(page).press("Escape");
    await expect(menu(page)).toHaveCount(0);

    await page.locator("button.node-panel-create-button").click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toMatchObject({
      modelId: "gemini-3.8-flash",
      instruction: "@copywriter taglines in @brand-voice",
      agent: { name: "copywriter", instructions: "Write three options." },
      skills: [
        { name: "brand-voice", content: "Warm, direct." },
        { name: "tone", content: "Calm." },
      ],
    });
  });

  test("an unknown handle and a second agent are notes; Create still works and sends neither", async ({ page }) => {
    const bodies = await stubText(page);
    await seed(page, { skills, agents: [...agents, { ...agents[0], id: "a2", name: "planner", skillIds: [] }] });
    await addNode(page, /^Prompt$/);
    await box(page).fill("@copywriter and @planner, in @tone-guide");
    await expect(page.locator(".mention-note")).toHaveText([
      "@tone-guide isn't in your skills or agents, so it's sent as text.",
      "One agent per prompt: @planner is sent as text.",
    ]);
    // Typed, not picked: the model stays.
    await expect(page.locator(".node-panel-model-trigger")).toHaveText("Gemini 3.5 Flash Lite");
    await page.locator("button.node-panel-create-button").click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0].agent).toEqual({ name: "copywriter", instructions: "Write three options." });
    expect(bodies[0].skills).toEqual([{ name: "tone", content: "Calm." }]);
  });

  test("a prompt with no handles sends what it did before", async ({ page }) => {
    const bodies = await stubText(page);
    await seed(page);
    await addNode(page, /^Prompt$/);
    await box(page).fill("plain prompt");
    await page.locator("button.node-panel-create-button").click();
    await expect.poll(() => bodies.length).toBe(1);
    // No agent or skills; the brand (#452) goes with every request, on or off.
    expect(Object.keys(bodies[0]).sort()).toEqual(["brand", "instruction", "modelId", "temperature"]);
  });

  test("Esc closes the menu, not the panel; undo takes back an insert", async ({ page }) => {
    await seed(page);
    await addNode(page, /^Prompt$/);
    await box(page).click();
    await box(page).pressSequentially("@to");
    await expect(menu(page)).toBeVisible();
    await box(page).press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(page.locator("h2.node-form-header-title")).toHaveText("Prompt");
    await expect(box(page)).toHaveValue("@to");

    // A later @ opens it again; an insert is one undo step, as typing is.
    await box(page).pressSequentially(" @to");
    await box(page).press("Enter");
    await expect(box(page)).toHaveValue("@to @tone ");
    await box(page).press("ControlOrMeta+z");
    await expect(box(page)).toHaveValue("@to @to");
  });

  test("with no skills or agents, the menu links to their pages", async ({ page }) => {
    await seed(page, { skills: [], agents: [] });
    await addNode(page, /^Prompt$/);
    await box(page).click();
    await box(page).pressSequentially("@");
    await expect(menu(page)).toContainText("No skills or agents yet.");
    await menu(page).getByRole("button", { name: "Skills" }).click();
    await expect(page.getByRole("heading", { name: "Skills", level: 1 })).toBeVisible();
  });

  for (const zoom of [0.5, 1.5]) {
    test(`at ${zoom * 100}% the menu opens under the @ at its usual size`, async ({ page }) => {
      await seed(page);
      await setZoom(page, zoom);
      await addNode(page, /^Prompt$/);
      await box(page).click();
      await box(page).pressSequentially("in @");
      const field = (await box(page).boundingBox())!;
      const m = (await menu(page).boundingBox())!;
      expect(m.y).toBeGreaterThan(field.y);
      expect(m.y).toBeLessThan(field.y + field.height + 8);
      expect(Math.round(m.width)).toBe(256);
    });
  }
});
