import { test, expect, type Page } from "@playwright/test";
import { makePng, openBoard, reloadBoard, showEveryMenuItem } from "./helpers";

// Generation uses the brand (#452): Use brand on the Create Image and Prompt
// panels, on by default, with a line saying what it sends. The dev backend has
// no VERTEX_PROJECT_ID, so its mock text names the brand it was given.

const NO_COLOURS = { primary: "", secondary: "", accent: "" };

async function addAsset(page: Page, kind: string, name: string, details: Record<string, string> = {}, body?: Buffer, type = "image/png") {
  const up = await page.request.post(`/api/proxy/assets?kind=${kind}&name=${name}`, {
    headers: { "Content-Type": type },
    data: body ?? makePng(16, 16, [Math.floor(Math.random() * 255), 100, 160]),
  });
  const { id } = await up.json();
  if (Object.keys(details).length) await page.request.patch(`/api/proxy/assets/${id}`, { data: { details } });
  return id as string;
}

async function savePage(page: Page, record: Record<string, unknown>) {
  const current = await (await page.request.get("/api/proxy/brand-assets")).json();
  const res = await page.request.put("/api/proxy/brand-assets", {
    data: { revision: current.revision, productName: "", sku: "", masterId: "", colours: NO_COLOURS, assetIds: [], ...record },
  });
  expect(res.ok()).toBe(true);
}

/** A saved Assets page with a master, a primary logo, an Always reference and guidelines. */
async function setUpAssets(page: Page) {
  const master = await addAsset(page, "productImage", "front.png");
  const logo = await addAsset(page, "logo", "logo.png", { logoType: "Primary logo" });
  const sand = await addAsset(page, "reference", "sand.png", { scope: "always", use: "asIs" });
  const rules = await addAsset(page, "guidelines", "rules.md", {}, Buffer.from("# Rules\n\nLogo on light backgrounds."), "text/markdown");
  await savePage(page, { productName: "Trail shoe", masterId: master, assetIds: [master, logo, sand, rules] });
}

/** The brief, written and saved on the Brand page, as a marketer would. */
async function writeBrief(page: Page, name: string) {
  await page.locator(".sidebar-identity").click();
  await page.getByRole("menuitem", { name: "Brand" }).click();
  await page.getByLabel("Campaign Name").fill(name);
  await page.getByRole("button", { name: "Save brand" }).click();
  await expect(page.getByRole("button", { name: "Save brand" })).toBeDisabled();
  await page.getByRole("button", { name: "Close Brand" }).click();
}

async function addNode(page: Page, label: RegExp) {
  const before = await page.locator("button.node-panel-placeholder").count();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForTimeout(250);
  await page.locator(".floating-dock-submenu button").filter({ hasText: label }).first().click();
  await page.waitForFunction((n) => document.querySelectorAll("button.node-panel-placeholder").length > n, before, { timeout: 10_000 });
  await page.waitForTimeout(300);
}

const useBrand = (page: Page) => page.getByRole("switch", { name: "Use brand" });
const summary = (page: Page) => page.locator(".node-panel-brand-summary");

async function create(page: Page, instruction: string) {
  await page.locator("textarea.node-panel-instruction").first().fill(instruction);
  await page.locator("button.node-panel-create-button").first().click();
}

test.describe("Use brand", () => {
  test.beforeEach(async ({ page }) => {
    await showEveryMenuItem(page);
    await openBoard(page);
    await page.request.delete("/api/proxy/brand-assets/pending");
  });

  test("nothing set up: on, says so, and links to Assets", async ({ page }) => {
    await savePage(page, {});
    await addNode(page, /^Image$/);
    await expect(useBrand(page)).toHaveAttribute("aria-checked", "true");
    await expect(summary(page)).toHaveText("Nothing set up yet. Set it up on Assets");
    await summary(page).getByRole("button", { name: "Set it up on Assets" }).click();
    await expect(page.getByRole("heading", { name: "Assets", level: 1 })).toBeVisible();
  });

  test("Create Image sends the brief and says what the brand brought; off sends nothing", async ({ page }) => {
    await setUpAssets(page);
    await writeBrief(page, "Urban Running 2026");
    await addNode(page, /^Image$/);
    await expect(summary(page)).toHaveText("Brief · Trail shoe · Logo · 1 reference · 1 guidelines file");

    const sent = page.waitForRequest((r) => r.url().endsWith("/generate/image") && r.method() === "POST");
    const answered = page.waitForResponse((r) => r.url().endsWith("/generate/image"));
    await create(page, "A hero shot on a city street");
    // On: the backend reads the saved brief itself (#454).
    expect((await sent).postDataJSON().brand).toBe(true);
    expect((await (await answered).json()).brand).toEqual({ used: ["brief", "Trail shoe", "logo", "1 reference", "1 guidelines file"] });

    await useBrand(page).click();
    await expect(useBrand(page)).toHaveAttribute("aria-checked", "false");
    await expect(summary(page)).toHaveText("Off: only the prompt and its references.");
    const offSent = page.waitForRequest((r) => r.url().endsWith("/generate/image") && r.method() === "POST");
    await create(page, "A hero shot, no brand");
    expect((await offSent).postDataJSON().brand).toBe(false);
  });

  test("a Prompt node's text follows the brand; off, it does not", async ({ page }) => {
    await setUpAssets(page);
    await writeBrief(page, "Urban Running 2026");
    await addNode(page, /^Prompt$/);
    await create(page, "Three taglines");
    const out = page.locator(".node-panel-text-output");
    await expect(out).toContainText("(with brand: brief, Trail shoe, logo, 1 reference, 1 guidelines file)");
    await expect(out).toContainText("Product: Trail shoe, Brand logo, Reference: sand.png");

    // The panel stays open after Create.
    await useBrand(page).click();
    await create(page, "Three taglines again");
    await expect(out).toHaveText("[mock] Three taglines again");
  });

  test("off is kept with the node after a reload", async ({ page }) => {
    await addNode(page, /^Image$/);
    await useBrand(page).click();
    await expect(useBrand(page)).toHaveAttribute("aria-checked", "false");
    await page.locator("textarea.node-panel-instruction").first().fill("kept");
    await page.locator("textarea.node-panel-instruction").first().blur();
    await page.waitForTimeout(600);
    await reloadBoard(page, { panels: 1 });
    // A click selects the node, a second opens its panel.
    const node = page.locator("button.node-panel-placeholder").first();
    await node.click();
    await node.click();
    await expect(useBrand(page)).toHaveAttribute("aria-checked", "false");
  });

  test("when the brand cannot be read, it is made without it and says so", async ({ page }) => {
    await page.route(/\/generate\/text$/, async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      await route.fulfill({ response: res, json: { ...body, brand: { failed: true } } });
    });
    await addNode(page, /^Prompt$/);
    await create(page, "Three taglines");
    await expect(page.locator(".node-panel-text-output")).toContainText("[mock] Three taglines");
    await expect(page.getByRole("status")).toHaveText("Made without brand: couldn't load it.");
  });
});
