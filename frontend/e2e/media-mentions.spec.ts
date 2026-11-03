import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, showEveryMenuItem } from "./helpers";

// Creates Video nodes, which #404 hides by default, so offer them all.
test.beforeEach(({ page }) => showEveryMenuItem(page));

// @ in Image and Video panels (#240): skills only. Their bodies travel with
// the prompt; an agent is a Prompt-panel setup and is sent as text.

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

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Records image and video requests and answers them, so Create needs no backend. */
async function stubMedia(page: Page) {
  const bodies: { path: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/proxy/generate/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobId: "j", status: "done", videoUrl: "https://example.test/v.mp4", modelUsed: "veo" }) });
    }
    bodies.push({ path, body: req.postDataJSON() });
    const video = path.endsWith("/generate/video");
    await route.fulfill({
      status: video ? 202 : 200,
      contentType: "application/json",
      body: JSON.stringify(video ? { jobId: "j", status: "pending" } : { jobId: "j", status: "done", imageUrl: PNG, modelUsed: "m" }),
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
const menu = (page: Page) => page.getByRole("listbox", { name: "Skills", exact: true });
const options = (page: Page) => menu(page).locator(".mention-menu-name");

test.describe("Image and Video panels: @ skills (#240)", () => {
  for (const kind of [/^Image$/, /^Video$/]) {
    test(`${kind.source.slice(1, -1)}: @ lists skills only, inserts, and Create sends their bodies`, async ({ page }) => {
      const bodies = await stubMedia(page);
      await seed(page);
      await addNode(page, kind);
      await box(page).click();
      await box(page).pressSequentially("A poster in @");
      await expect(options(page)).toHaveText(["brand-voice", "campaign-brief", "tone"]);
      await expect(menu(page)).not.toContainText("Agents");
      await box(page).press("Enter");
      await expect(box(page)).toHaveValue("A poster in @brand-voice ");
      await expect(page.locator(".mention-known")).toHaveText(["@brand-voice"]);

      await page.locator("button.node-panel-create-button").click();
      await expect.poll(() => bodies.length).toBe(1);
      expect(bodies[0].body).toMatchObject({
        instruction: "A poster in @brand-voice",
        skills: [{ name: "brand-voice", content: "Warm, direct." }],
      });
      expect(bodies[0].body).not.toHaveProperty("agent");
    });
  }

  test("an agent's handle is a note, and isn't sent", async ({ page }) => {
    const bodies = await stubMedia(page);
    await seed(page);
    await addNode(page, /^Image$/);
    await box(page).fill("@copywriter poster in @tone");
    await expect(page.locator(".mention-note")).toHaveText(["Agents work in Prompt panels: @copywriter is sent as text."]);
    await expect(page.locator(".mention-known")).toHaveText(["@tone"]);
    await page.locator("button.node-panel-create-button").click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0].body.skills).toEqual([{ name: "tone", content: "Calm." }]);
  });

  test("no handles: the request is as before", async ({ page }) => {
    const bodies = await stubMedia(page);
    await seed(page);
    await addNode(page, /^Image$/);
    await box(page).fill("a plain poster");
    await page.locator("button.node-panel-create-button").click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0].body).not.toHaveProperty("skills");
  });

  test("with no skills, the menu links to Skills only", async ({ page }) => {
    await seed(page, { skills: [], agents });
    await addNode(page, /^Image$/);
    await box(page).click();
    await box(page).pressSequentially("@");
    await expect(menu(page)).toContainText("No skills yet.");
    await expect(menu(page).getByRole("button")).toHaveText(["Skills"]);
  });
});
