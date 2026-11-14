import { test, expect, type Page } from "@playwright/test";
import { openBoard, reloadBoard, setZoom } from "./helpers";

// The Campaign Brief on the Brand page (#409), in place of the Art-direction
// components. The product and logo themselves belong to the Assets page; the
// brief only says whether each must appear.

async function openBrand(page: Page) {
  await page.locator(".sidebar-identity").click();
  await page.getByRole("menuitem", { name: "Brand" }).click();
  await expect(page.getByRole("heading", { name: "Brand", level: 1 })).toBeVisible();
}

const bar = (page: Page) => page.getByRole("region", { name: "Save brand" });
const saveBrand = (page: Page) => page.getByRole("button", { name: "Save brand" });

test.describe("Campaign Brief", () => {
  test("sits between Industry and Brand Profile, with its groups, placeholders and defaults", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openBoard(page);
    await openBrand(page);

    const y = async (name: string) => (await page.getByRole("heading", { name, level: 2 }).boundingBox())!.y;
    const industryY = (await page.getByLabel("Industry").boundingBox())!.y;
    expect(await y("Campaign Brief")).toBeGreaterThan(industryY);
    expect(await y("Brand Profile")).toBeGreaterThan(await y("Campaign Brief"));
    await expect(page.getByText("Define the campaign details that will guide creative generation.")).toBeVisible();
    await expect(page.locator(".brief-group-title")).toHaveText([
      "Basics", "Audience", "Message", "Offer", "Mandatory elements", "Creative references", "Guardrails",
    ]);

    for (const [label, placeholder] of [
      ["Campaign Name", "Urban Running 2026"],
      ["Objective", "Pick one, or describe your own goal"],
      ["Target Audience", "Urban professionals, 25–35"],
      ["Audience Insight", "They want to run, but city routes feel monotonous"],
      ["Key Message", "Performance and comfort for everyday city running"],
      ["Offer (optional)", "20% off until Sunday"],
      ["CTA text", "Shop now"],
      ["Do", "Show the product in motion\nKeep the city setting in daylight"],
      ["Don't", "Show competitor products\nMake health or performance claims"],
    ] as const) {
      await expect(page.getByLabel(label, { exact: true })).toHaveAttribute("placeholder", placeholder);
      await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
    }

    // Fixed for now, and read-only.
    await expect(page.locator(".brief-readonly")).toHaveText(/Europe · English\s*More options coming soon/);
    await expect(page.locator(".brief-readonly input")).toHaveCount(0);

    for (const [name, on] of [["Product", true], ["Logo", true], ["CTA", true], ["Legal Copy", false]] as const) {
      await expect(page.getByRole("switch", { name })).toHaveAttribute("aria-checked", String(on));
    }
    await expect(page.getByText("On: it must be kept or included when creative is generated.")).toBeVisible();
    await expect(page.getByText("Not required for this campaign.")).toHaveCount(1);
    // Switches only: the product and logo are added on the Assets page, and
    // shown here from it (#444), each with a way there.
    await expect(page.getByText(/^(No product on the Assets page yet\.|Loading…)$|SKU|Change on the Assets page/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose image" })).toHaveCount(0);
    await expect(page.getByText("Write as much as you need. Each rule on its own line reads best.")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("every field keeps its border: darker on hover, the accent on focus", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    const name = page.getByLabel("Campaign Name");
    const border = () => name.evaluate((el) => getComputedStyle(el).borderTopColor);
    const rest = await border();
    expect(rest).not.toBe("rgba(0, 0, 0, 0)");
    await name.hover();
    await expect.poll(border).not.toBe(rest);
    await name.focus();
    // The accent (#437, purple since #547), #a100ff.
    await expect.poll(border).toBe("rgb(161, 0, 255)");
    await name.fill("Monsoon Collection 2027");
    // Filled, unfocused and unhovered: back to the resting border, not hidden.
    await page.mouse.move(5, 5);
    await page.getByLabel("Industry").focus();
    await expect.poll(border).toBe(rest);
  });

  test("Objective takes free text and suggests the five objectives", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    const objective = page.getByLabel("Objective");
    const listId = await objective.getAttribute("list");
    expect(await page.locator(`datalist[id="${listId}"] option`).evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).toEqual([
      "Awareness", "Consideration", "Engagement", "Conversion", "Retention",
    ]);
    await objective.fill("Drive pre-orders before launch");
    await expect(objective).toHaveValue("Drive pre-orders before launch");
  });

  test("Tone takes up to three; the rest wait until one is unpicked", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    const tone = (name: string) => page.getByRole("button", { name, exact: true });
    for (const t of ["Bold", "Premium", "Urgent"]) await tone(t).click();
    await expect(tone("Bold")).toHaveAttribute("aria-pressed", "true");
    for (const t of ["Playful", "Warm", "Minimal", "Trustworthy"]) await expect(tone(t)).toBeDisabled();
    await expect(page.getByText("Up to 3")).toBeVisible();
    await tone("Premium").click();
    await expect(tone("Premium")).toHaveAttribute("aria-pressed", "false");
    await expect(tone("Warm")).toBeEnabled();
  });

  test("a mandatory element hides its field when off, and keeps what was typed", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    const cta = page.getByRole("switch", { name: "CTA" });
    await page.getByLabel("CTA text").fill("Shop the collection");
    await cta.click();
    await expect(page.getByLabel("CTA text")).toHaveCount(0);
    await expect(page.getByText("Not required for this campaign.")).toHaveCount(2);
    await cta.click();
    await expect(page.getByLabel("CTA text")).toHaveValue("Shop the collection");

    await page.getByRole("switch", { name: "Legal Copy" }).click();
    await expect(page.getByLabel("Legal copy text")).toHaveAttribute("placeholder", "Offer valid while stocks last. T&Cs apply.");
  });

  test("Do and Don't grow with their text instead of scrolling", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    const dos = page.getByLabel("Do", { exact: true });
    const before = (await dos.boundingBox())!.height;
    await dos.fill(["Show the product in motion", "Keep the city setting in daylight", "Use real runners", "Show wet streets", "Keep logos legible", "Prefer morning light"].join("\n"));
    const after = (await dos.boundingBox())!.height;
    expect(after).toBeGreaterThan(before + 30);
    expect(await dos.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  });

  test("the brief saves with Save brand, Cancel restores it, and a reload keeps it", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    await page.getByLabel("Campaign Name").fill("Monsoon Collection 2027");
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    await expect(bar(page)).toContainText("Unsaved changes");
    await saveBrand(page).click();
    await expect(saveBrand(page)).toBeDisabled();

    await page.getByLabel("Campaign Name").fill("Something else");
    await page.getByRole("switch", { name: "Logo" }).click();
    await bar(page).getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Campaign Name")).toHaveValue("Monsoon Collection 2027");
    await expect(page.getByRole("switch", { name: "Logo" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "Bold", exact: true })).toHaveAttribute("aria-pressed", "true");

    // Kept across leaving and coming back, and since #454 across a reload.
    await page.locator(".sidebar-item", { hasText: "Playspace" }).click();
    await openBrand(page);
    await expect(page.getByLabel("Campaign Name")).toHaveValue("Monsoon Collection 2027");
    await reloadBoard(page);
    await openBrand(page);
    await expect(page.getByLabel("Campaign Name")).toHaveValue("Monsoon Collection 2027");
  });

  test("leaving with unsaved brief edits asks first", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    await page.getByLabel("Key Message").fill("Run the city");
    await page.locator(".library-page").focus();
    await page.getByRole("button", { name: "Close Brand" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Discard changes?");
    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByLabel("Key Message")).toHaveValue("Run the city");
  });

  test("Tab follows the page order through the brief", async ({ page }) => {
    await openBoard(page);
    await openBrand(page);
    await page.getByLabel("Campaign Name").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Objective")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Target Audience")).toBeFocused();
  });

  test("the page is the same at 50%, 100% and 150% zoom", async ({ page }) => {
    await openBoard(page);
    for (const z of [0.5, 1.5, 1]) {
      await setZoom(page, z);
      await openBrand(page);
      await expect(page.getByRole("heading", { name: "Campaign Brief", level: 2 })).toBeVisible();
      await page.getByRole("button", { name: "Close Brand" }).click();
    }
  });
});
