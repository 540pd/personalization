import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, setZoom } from "./helpers";

// The support form (#428): a dialog from the rail's Support, signed in, and
// the /support page, signed out. POST /api/support is stubbed, so no test
// spends the backend's 5-an-hour limit; the route itself is the backend's
// supertest suite's.

interface Sent {
  bodies: Record<string, unknown>[];
}

/** Answers POST /api/support with `status`, after `delayMs`. */
async function stubSupport(page: Page, sent: Sent, status = 200, delayMs = 0) {
  await page.unroute("**/api/proxy/support");
  await page.route("**/api/proxy/support", async (route: Route) => {
    sent.bodies.push(route.request().postDataJSON());
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(status === 200 ? { ok: true } : { error: "x" }) });
  });
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "Support" });
const supportButton = (page: Page) => page.locator(".sidebar-support");
const contactUs = (page: Page) => page.getByRole("button", { name: "Contact us" });

async function fill(page: Page, { client = "Yes" }: { client?: "Yes" | "No" } = {}) {
  await page.getByLabel("Name").fill("Priya Sharma");
  await page.getByLabel("Email").fill("priya@company.test");
  await page.getByRole("radio", { name: client }).check();
  await page.getByLabel("What is your message for us?").fill("The generator keeps failing on my board.");
}

test.describe("Support dialog, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
  });

  test("opens on Name; × and Escape close it, back to Support, keeping the draft; a click outside doesn't", async ({ page }) => {
    await supportButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText("Tell us how we can help and we'll reply by email. All fields are required.");
    await expect(page.getByLabel("Name")).toBeFocused();
    await expect(page.getByRole("radio", { name: "Yes" })).not.toBeChecked();
    await expect(page.getByRole("radio", { name: "No" })).not.toBeChecked();
    await expect(page.getByLabel("What is your message for us?")).toHaveAttribute(
      "placeholder",
      "Tell us what you were trying to do, what happened, and what you expected.",
    );

    await page.getByLabel("Name").fill("Priya");
    await page.mouse.click(5, 5);
    await expect(dialog(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(supportButton(page)).toBeFocused();

    await supportButton(page).click();
    await expect(page.getByLabel("Name")).toHaveValue("Priya");
    await dialog(page).getByRole("button", { name: "Close" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(supportButton(page)).toBeFocused();
  });

  test("Tab stays inside the dialog", async ({ page }) => {
    await supportButton(page).click();
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
  });

  test("Contact us with gaps: an error under each, focus on the first; they clear as fixed", async ({ page }) => {
    const sent: Sent = { bodies: [] };
    await stubSupport(page, sent);
    await supportButton(page).click();
    await contactUs(page).click();
    await expect(dialog(page).locator(".support-error")).toHaveText([
      "Enter your name.",
      "Enter your email address.",
      "Choose Yes or No.",
      "Tell us a bit more: at least 10 characters.",
    ]);
    await expect(page.getByLabel("Name")).toBeFocused();
    await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Name").fill("Priya Sharma");
    await page.getByLabel("Email").fill("priya@");
    await contactUs(page).click();
    await expect(page.getByLabel("Email")).toBeFocused();
    await expect(dialog(page).locator(".support-error").first()).toHaveText("Enter a full email address, like name@company.com.");
    expect(sent.bodies).toHaveLength(0);
  });

  test("sends: Sending…, then Message sent with Close; the next open is a fresh form", async ({ page }) => {
    const sent: Sent = { bodies: [] };
    await stubSupport(page, sent, 200, 600);
    await supportButton(page).click();
    await fill(page, { client: "No" });
    await contactUs(page).click();
    await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
    await expect(page.getByLabel("Name")).toBeDisabled();

    await expect(dialog(page).getByRole("heading", { name: "Message sent" })).toBeVisible();
    await expect(dialog(page)).toContainText("Thanks, Priya. We'll reply to priya@company.test.");
    expect(sent.bodies).toHaveLength(1);
    expect(sent.bodies[0]).toMatchObject({
      name: "Priya Sharma",
      email: "priya@company.test",
      clientProject: false,
      message: "The generator keeps failing on my board.",
      website: "",
      context: { page: "Playspace", appVersion: expect.any(String), userAgent: expect.any(String) },
    });

    await dialog(page).getByRole("button", { name: "Close", exact: true }).last().click();
    await expect(dialog(page)).toHaveCount(0);
    await supportButton(page).click();
    await expect(page.getByLabel("Name")).toHaveValue("");
    await expect(contactUs(page)).toBeVisible();
  });

  test("failed, then too many: the text is kept and Contact us tries again", async ({ page }) => {
    const sent: Sent = { bodies: [] };
    await stubSupport(page, sent, 503);
    await supportButton(page).click();
    await fill(page);
    await contactUs(page).click();
    await expect(dialog(page).getByRole("alert")).toHaveText("We couldn't send your message. Your text is still here, so you can try again.");
    await expect(page.getByLabel("Name")).toHaveValue("Priya Sharma");

    await stubSupport(page, sent, 429);
    await contactUs(page).click();
    await expect(dialog(page).getByRole("alert")).toHaveText("Too many messages from this network. Try again in an hour.");

    await stubSupport(page, sent, 200);
    await contactUs(page).click();
    await expect(dialog(page).getByRole("heading", { name: "Message sent" })).toBeVisible();
    expect(sent.bodies).toHaveLength(3);
  });

  test("closed while sending: a toast says it went, or that it didn't with Open it", async ({ page }) => {
    const sent: Sent = { bodies: [] };
    await stubSupport(page, sent, 200, 800);
    await supportButton(page).click();
    await fill(page);
    await contactUs(page).click();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator(".board-toast")).toContainText("Message sent. We'll reply by email.");
    await supportButton(page).click();
    await expect(page.getByLabel("Name")).toHaveValue("");
    await page.keyboard.press("Escape");

    await stubSupport(page, sent, 500, 800);
    await supportButton(page).click();
    await fill(page);
    await contactUs(page).click();
    await page.keyboard.press("Escape");
    const toast = page.locator(".board-toast");
    await expect(toast).toContainText("Your support message wasn't sent.");
    await toast.getByRole("button", { name: "Open it" }).click();
    await expect(dialog(page).getByRole("alert")).toContainText("We couldn't send your message.");
    await expect(page.getByLabel("Name")).toHaveValue("Priya Sharma");
  });

  test("works the same at 50%, 100% and 150% zoom", async ({ page }) => {
    for (const z of [0.5, 1.5, 1]) {
      await setZoom(page, z);
      await supportButton(page).click();
      await expect(dialog(page)).toBeVisible();
      await expect(contactUs(page)).toBeInViewport();
      await page.keyboard.press("Escape");
    }
  });
});

test.describe("Support, signed out", () => {
  test("the sign-in screen's Contact us opens /support: no ×, and Back to sign in once sent", async ({ page }) => {
    const json = (route: Route, status: number, body: unknown) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    await page.route("**/api/proxy/auth-config", (r) => json(r, 200, { mode: "dev" }));
    await page.route("**/api/proxy/session", (r) => json(r, 401, { error: "token_missing" }));
    const sent: Sent = { bodies: [] };
    await stubSupport(page, sent);

    await page.goto("/");
    await expect(page.locator(".auth-card")).toContainText("Trouble signing in or a question?");
    await page.getByRole("link", { name: "Contact us" }).click();
    await expect(page).toHaveURL(/\/support$/);
    await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close" })).toHaveCount(0);

    await fill(page);
    await contactUs(page).click();
    await expect(page.getByRole("heading", { name: "Message sent" })).toBeVisible();
    expect(sent.bodies[0]).toMatchObject({ clientProject: true, context: { page: "Support page (/support)" } });
    await page.getByRole("main").getByRole("link", { name: "Back to sign in" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
