import { test, expect, type Page } from "@playwright/test";
import { openBoard, panelBoxes } from "./helpers";

// The board saved to the account (#324). Signed in with the dev sign-in
// placeholder; the account's board is a fake server here that keeps
// revisions like the real one, so each test starts from its own.

interface Account {
  revision: number;
  content: unknown;
  puts: number[];
  /** Answer PUTs with 503, as an outage would. */
  down: boolean;
}

async function signedIn(page: Page, account: Account, email = "dev.user@accenture.com") {
  const json = (status: number, body: unknown) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/proxy/auth-config", (r) => r.fulfill(json(200, { mode: "dev" })));
  await page.route("**/api/proxy/session", (r) => r.fulfill(json(200, { email })));
  await page.route("**/api/proxy/boards/current", async (r) => {
    const req = r.request();
    if (req.method() === "PUT") {
      const { revision, content } = req.postDataJSON() as { revision: number; content: unknown };
      account.puts.push(revision);
      if (account.down) return r.fulfill(json(503, { error: "unavailable" }));
      if (revision !== account.revision) return r.fulfill(json(409, { error: "conflict", revision: account.revision }));
      account.revision += 1;
      account.content = content;
      return r.fulfill(json(200, { revision: account.revision, updatedAt: "now" }));
    }
    return r.fulfill(json(200, { board: { id: "b", name: "PlaySpace" }, revision: account.revision, updatedAt: null, content: account.content }));
  });
}

const fresh = (): Account => ({ revision: 0, content: null, puts: [], down: false });
const status = (page: Page) => page.locator(".board-sync-status");
const promptNodes = (page: Page) => page.locator("textarea.node-panel-instruction");

async function addPrompt(page: Page, text: string) {
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.locator(".floating-dock-submenu button").filter({ hasText: /^Prompt$/ }).first().click();
  await promptNodes(page).last().fill(text);
}

test.describe("The board in the account (#324)", () => {
  test("anonymous: the board stays in this browser, and nothing is sent", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/boards/current")) calls.push(r.method()); });
    await openBoard(page);
    await addPrompt(page, "local only");
    await page.waitForTimeout(1_500);
    expect(calls).toEqual([]);
    await expect(status(page)).toHaveCount(0);
  });

  test("signed in: a change is saved to the account, and loads back on another browser", async ({ page, browser }) => {
    const account = fresh();
    await signedIn(page, account);
    await openBoard(page);
    await expect(status(page)).toHaveText("Saved");
    await addPrompt(page, "taglines for spring");
    await expect.poll(() => account.revision).toBeGreaterThan(1);
    await expect(status(page)).toHaveText("Saved");

    // A second browser: no local copy at all, only the account's.
    const other = await browser.newPage();
    await signedIn(other, account);
    await openBoard(other);
    // Closed on load, as every node is: the node is there, and its text is
    // in this browser's copy now.
    await expect.poll(async () => (await panelBoxes(other)).length).toBe(1);
    expect(await other.evaluate(() => localStorage.getItem("gcos-node-panels") ?? "")).toContain("taglines for spring");
    await other.close();
  });

  test("saved in another tab meanwhile: a banner, nothing overwritten, and Load the latest", async ({ page }) => {
    const account = fresh();
    await signedIn(page, account);
    await openBoard(page);
    await expect(status(page)).toHaveText("Saved");
    const theirs = account.content;
    // Another tab saves an empty board over ours.
    account.revision += 1;
    await addPrompt(page, "mine");

    const banner = page.locator(".board-sync-banner");
    await expect(banner).toContainText("This board changed in another tab or browser.");
    await expect(status(page)).toHaveText("Not saved");
    expect(account.content).toBe(theirs);

    await banner.getByRole("button", { name: "Load the latest" }).click();
    await expect(banner).toHaveCount(0);
    await expect(promptNodes(page)).toHaveCount(0);
    await expect(status(page)).toHaveText("Saved");
  });

  test("the server failing: kept here, retried, then saved", async ({ page }) => {
    const account = fresh();
    await signedIn(page, account);
    await openBoard(page);
    await expect(status(page)).toHaveText("Saved");
    account.down = true;
    await addPrompt(page, "while down");
    await expect(status(page)).toHaveText("Not saved · retrying");
    account.down = false;
    await expect(status(page)).toHaveText("Saved", { timeout: 10_000 });
    expect(JSON.stringify(account.content)).toContain("while down");
  });

  /** A board left in this browser by `owner`: one node named "ben's board". */
  async function leftBy(page: Page, owner: string) {
    await page.addInitScript((o) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("gcos-board-sync", JSON.stringify({ owner: o, revision: 0, pending: true }));
      localStorage.setItem("gcos-node-panels", JSON.stringify({
        state: { panels: [{ id: "panel-1", kind: "image", canvasX: 300, canvasY: 300, w: 300, h: 169, label: "ben's board" }] },
        version: 0,
      }));
    }, owner);
  }

  test("the browser's own account's copy is shown and sent (control)", async ({ page }) => {
    const account = fresh();
    await leftBy(page, "dev.user@accenture.com");
    await signedIn(page, account);
    await openBoard(page);
    await expect(page.getByText("ben's board")).toBeVisible();
    await expect.poll(() => JSON.stringify(account.content ?? "")).toContain("ben's board");
  });

  test("another account's board in this browser is never shown or sent", async ({ page }) => {
    const account = fresh();
    await leftBy(page, "ben@accenture.com");
    await signedIn(page, account);
    await openBoard(page);
    await expect(status(page)).toHaveText("Saved");
    await expect(page.getByText("ben's board")).toHaveCount(0);
    expect(JSON.stringify(account.content ?? "")).not.toContain("ben's board");
    expect(await page.evaluate(() => localStorage.getItem("gcos-node-panels") ?? "")).not.toContain("ben's board");
  });
});
