import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard } from "./helpers";

// Sign in with Google (#321). The backend's auth routes are stubbed, and so
// is Google: a stand-in for Identity Services renders a plain button whose
// click hands back a credential, so no test ever reaches accounts.google.com.

/** A JWT-shaped credential; only its payload's email is read client-side. */
const credential = (email: string) =>
  `h.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.s`;

interface Auth {
  /** The session cookie's email, or null for none. */
  session: string | null;
  /** What session/refresh answers. */
  refresh?: { status: number; body: unknown };
  calls: string[];
}

async function requireSignIn(page: Page, auth: Auth, credentialEmail = "ana.silva@accenture.com") {
  await page.route("https://accounts.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.addInitScript((token) => {
    let callback: ((r: { credential: string }) => void) | null = null;
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (c: { callback: typeof callback }) => { callback = c.callback; },
          renderButton: (parent: HTMLElement) => {
            const b = document.createElement("button");
            b.textContent = "Sign in with Google";
            b.onclick = () => callback?.({ credential: token });
            parent.replaceChildren(b);
          },
          disableAutoSelect: () => {},
        },
      },
    };
  }, credential(credentialEmail));

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/proxy/auth-config", (r) => json(r, 200, { mode: "required" }));
  await page.route("**/api/proxy/session", (r) => {
    auth.calls.push("GET session");
    return auth.session ? json(r, 200, { email: auth.session }) : json(r, 401, { error: "token_missing" });
  });
  await page.route("**/api/proxy/session/refresh", (r) => {
    auth.calls.push(`refresh ${r.request().headers()["authorization"]}`);
    const reply = auth.refresh ?? { status: 200, body: { ok: true } };
    if (reply.status === 200) auth.session = credentialEmail;
    return json(r, reply.status, reply.body);
  });
  await page.route("**/api/proxy/session/sign-out", (r) => {
    auth.calls.push("sign-out");
    auth.session = null;
    return r.fulfill({ status: 204 });
  });
}

const signInScreen = (page: Page) => page.locator(".auth-card");
const googleButton = (page: Page) => page.getByRole("button", { name: "Sign in with Google" });
const stage = (page: Page) => page.locator(".konvajs-content");

test.describe("Sign in with Google (#321)", () => {
  test("anonymous mode opens the board and never loads Google", async ({ page }) => {
    const google: string[] = [];
    page.on("request", (r) => { if (r.url().includes("accounts.google.com")) google.push(r.url()); });
    await openBoard(page);
    await expect(signInScreen(page)).toHaveCount(0);
    expect(google).toEqual([]);
  });

  test("no session: the sign-in screen, then the board after Google", async ({ page }) => {
    const auth: Auth = { session: null, calls: [] };
    await requireSignIn(page, auth);
    await page.goto("/");
    await expect(signInScreen(page)).toContainText("Sign in with your work Google account");
    await expect(stage(page)).toHaveCount(0);

    await googleButton(page).click();
    await expect(stage(page)).toBeVisible();
    await expect(signInScreen(page)).toHaveCount(0);
    expect(auth.calls).toContain(`refresh Bearer ${credential("ana.silva@accenture.com")}`);
    await expect(page.locator(".sidebar-identity-name")).toHaveText("Ana Silva");
  });

  test("a valid session opens the board with no sign-in screen, not even briefly", async ({ page }) => {
    const auth: Auth = { session: "ana.silva@accenture.com", calls: [] };
    await requireSignIn(page, auth);
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.querySelector(".auth-card")) (window as unknown as { sawSignIn: boolean }).sawSignIn = true;
      }).observe(document, { childList: true, subtree: true });
    });
    await openBoard(page);
    await expect(page.locator(".sidebar-identity-name")).toHaveText("Ana Silva");
    expect(await page.evaluate(() => (window as unknown as { sawSignIn?: boolean }).sawSignIn ?? false)).toBe(false);
  });

  test("an account outside the allowed domain is told so, and stays signed out", async ({ page }) => {
    const auth: Auth = { session: null, calls: [], refresh: { status: 401, body: { error: "domain_not_allowed" } } };
    await requireSignIn(page, auth, "ana@gmail.com");
    await page.goto("/");
    await googleButton(page).click();
    await expect(signInScreen(page).getByRole("alert")).toHaveText("ana@gmail.com isn't allowed here. Sign in with your work Google account.");
    await expect(stage(page)).toHaveCount(0);
  });

  test("Sign out returns to the sign-in screen and keeps the board in this browser", async ({ page }) => {
    const auth: Auth = { session: "ana.silva@accenture.com", calls: [] };
    await requireSignIn(page, auth);
    await openBoard(page);
    await page.evaluate(() => localStorage.setItem("gcos-sign-out-probe", "kept"));
    await page.locator(".sidebar-identity").click();
    await expect(page.getByRole("menu")).toContainText("ana.silva@accenture.com");
    await page.getByRole("menuitem", { name: /Sign out/ }).click();

    await expect(signInScreen(page)).toBeVisible();
    expect(auth.calls).toContain("sign-out");
    expect(await page.evaluate(() => localStorage.getItem("gcos-sign-out-probe"))).toBe("kept");

    // And a reload stays signed out: the cookie is gone.
    await page.reload();
    await expect(signInScreen(page)).toBeVisible();
  });

  test("a session that ends mid-work shows a banner over the board; signing in there carries on", async ({ page }) => {
    const auth: Auth = { session: "ana.silva@accenture.com", calls: [] };
    await requireSignIn(page, auth);
    let expired = true;
    await page.route("**/api/proxy/generate/text", (r) =>
      expired
        ? r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "token_expired" }) })
        : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobId: "j", status: "done", text: "ok", modelUsed: "m" }) }),
    );
    await openBoard(page);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.locator(".floating-dock-submenu button").filter({ hasText: /^Prompt$/ }).first().click();
    await page.locator("textarea.node-panel-instruction").fill("three taglines");
    await page.locator("button.node-panel-create-button").click();

    const banner = page.locator(".auth-banner");
    await expect(banner).toContainText("Your session has ended");
    await expect(stage(page)).toBeVisible();
    await expect(page.locator("textarea.node-panel-instruction")).toHaveValue("three taglines");

    expired = false;
    await banner.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.locator("textarea.node-panel-instruction")).toHaveValue("three taglines");
  });
});
