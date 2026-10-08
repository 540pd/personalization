import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, collapsePanels, panelBoxes, clickEmpty, dragFrom } from "./helpers";

// node > video. The first asynchronous kind: the POST returns a job and the
// result arrives by polling, because a real generation runs for minutes and
// would time out on Cloud Run.
//
// These intercept the proxy so the pending window is controllable. The point
// is the contract and the UI around it, not Vertex.

const FAKE_VIDEO = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=";

interface StubOptions {
  /** How many polls return "pending" before the job settles. */
  pendingPolls?: number;
  /** Settle as failed instead of done. */
  fail?: string;
  /** Answer every poll with 404, as a restarted backend would. */
  lost?: boolean;
}

async function stubVideo(page: Page, opts: StubOptions = {}) {
  const calls: string[] = [];
  let polls = 0;
  const pendingPolls = opts.pendingPolls ?? 1;

  await page.route("**/api/proxy/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    calls.push(`${req.method()} ${path}`);

    if (req.method() === "POST" && path.endsWith("/generate/video")) {
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ jobId: "job-1", status: "pending" }),
      });
    }

    if (path.includes("/generate/job/")) {
      if (opts.lost) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ status: "failed", message: "Job not found." }),
        });
      }
      polls += 1;
      if (polls <= pendingPolls) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ jobId: "job-1", status: "pending" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          opts.fail
            ? { jobId: "job-1", status: "failed", message: opts.fail }
            : { jobId: "job-1", status: "done", videoUrl: FAKE_VIDEO, modelUsed: "mock" }
        ),
      });
    }

    return route.continue();
  });

  return calls;
}

async function addVideoNode(page: Page) {
  const before = await page.locator("button.node-panel-placeholder").count();
  await page.locator("button").nth(1).click();
  await page.waitForTimeout(250);
  await page.locator("button").filter({ hasText: /^Video$/ }).first().click();
  await page.waitForFunction(
    (n) => document.querySelectorAll("button.node-panel-placeholder").length > n,
    before,
    { timeout: 10_000 }
  );
  await page.waitForTimeout(300);
}

async function submit(page: Page, instruction: string) {
  await page.locator("textarea").first().fill(instruction);
  await page.waitForTimeout(150);
  await page.locator("button.node-panel-create-button").first().click();
}

test.describe("node > video", () => {
  test("creates a Create Video node with its own options", async ({ page }) => {
    await stubVideo(page);
    await openBoard(page);
    await addVideoNode(page);

    await expect(page.locator("h2.node-panel-title")).toHaveText("Create Video");
    // Video has duration and resolution, not aspect ratio and quality.
    await page.locator("button:has-text('Advanced')").first().click();
    await page.waitForTimeout(250);
    await expect(page.getByLabel("Duration")).toBeVisible();
    await expect(page.getByLabel("Resolution")).toBeVisible();
  });

  test("starts a job and shows pending on the node while the canvas stays usable", async ({ page }) => {
    // Several pending polls so the window is wide enough to interact in.
    await stubVideo(page, { pendingPolls: 3 });
    await openBoard(page);
    await addVideoNode(page);
    await submit(page, "a harbour at dusk");
    await page.waitForTimeout(600);
    await collapsePanels(page);

    // Pending is shown on the node, because the panel is usually closed by
    // the time a real generation finishes.
    await expect(page.getByText("Generating…")).toBeVisible();

    // The rest of the board is not blocked: another node can be created and
    // dragged while the job runs.
    const before = (await panelBoxes(page)).length;
    await page.locator("button").nth(1).click();
    await page.waitForTimeout(250);
    await page.locator("button").filter({ hasText: /^Image$/ }).first().click();
    await page.waitForTimeout(700);
    expect((await panelBoxes(page)).length).toBe(before + 1);
  });

  test("renders a video once the job completes", async ({ page }) => {
    await stubVideo(page, { pendingPolls: 1 });
    await openBoard(page);
    await addVideoNode(page);
    await submit(page, "a harbour at dusk");

    await expect(page.locator("video.node-panel-video")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator("video.node-panel-video")).toHaveAttribute("src", FAKE_VIDEO);
  });

  test("polls rather than waiting on the POST", async ({ page }) => {
    const calls = await stubVideo(page, { pendingPolls: 2 });
    await openBoard(page);
    await addVideoNode(page);
    await submit(page, "a harbour at dusk");
    await expect(page.locator("video.node-panel-video")).toHaveCount(1, { timeout: 20_000 });

    expect(calls.filter((c) => c.includes("POST") && c.endsWith("/generate/video"))).toHaveLength(1);
    // At least the pending ones plus the settling one.
    expect(calls.filter((c) => c.includes("/generate/job/")).length).toBeGreaterThanOrEqual(3);
  });

  test("surfaces a failed job and leaves the node recoverable", async ({ page }) => {
    await stubVideo(page, { pendingPolls: 1, fail: "Model quota exhausted." });
    await openBoard(page);
    await addVideoNode(page);
    await submit(page, "a harbour at dusk");

    await expect(page.locator(".node-panel-error")).toHaveText("Model quota exhausted.", {
      timeout: 15_000,
    });
    // Not stuck pending, and the submit is live again.
    await expect(page.getByText("Generating…")).toHaveCount(0);
    await expect(page.locator("button.node-panel-create-button").first()).toBeEnabled();
  });

  // The backend job store is in-memory, so a restart loses jobs. The node must
  // stop waiting and say so rather than spin forever.
  test("gives up with a reason when the job is gone", async ({ page }) => {
    await stubVideo(page, { lost: true });
    await openBoard(page);
    await addVideoNode(page);
    await submit(page, "a harbour at dusk");

    await expect(page.locator(".node-panel-error")).toContainText("Job not found", {
      timeout: 15_000,
    });
  });

  test("deleting a node mid-job stops it cleanly", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await stubVideo(page, { pendingPolls: 5 });
    await openBoard(page);
    await addVideoNode(page);
    await submit(page, "a harbour at dusk");
    await page.waitForTimeout(600);
    await collapsePanels(page);

    const [node] = await panelBoxes(page);
    await page.mouse.click(node.x + 12, node.y + 12);
    await page.waitForTimeout(300);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(2500);

    expect(await panelBoxes(page)).toHaveLength(0);
    expect(errs).toHaveLength(0);
  });

  // Everything shared must work with no video-specific code.
  test("gets ports, drag and selection like any other node", async ({ page }) => {
    await stubVideo(page);
    await openBoard(page);
    await addVideoNode(page);
    await collapsePanels(page);
    await clickEmpty(page);

    // One, not two: video is terminal, so it has an input and no output.
    expect(await page.locator('div[title="Input"], div[title="Output"]').count()).toBe(1);

    const [node] = await panelBoxes(page);
    await dragFrom(page, node.x + node.w / 2, node.y + node.h / 2, -200);
    const [moved] = await panelBoxes(page);
    expect(Math.round(moved.x)).toBe(Math.round(node.x - 200));
  });

  // Video is the end of a workflow: it consumes references but produces
  // nothing another model can use, so it renders no output port. Showing one
  // that silently contributed nothing was worse than showing none.
  test("is terminal — an input port but no output port", async ({ page }) => {
    await stubVideo(page);
    await openBoard(page);
    await addVideoNode(page);
    await collapsePanels(page);

    const titles = await page.evaluate(() =>
      [...document.querySelectorAll('div[title="Input"], div[title="Output"]')]
        .map((d) => d.getAttribute("title")));
    expect(titles).toEqual(["Input"]);
  });

  test("an image node beside it still has both ports", async ({ page }) => {
    // Guards against the terminal flag leaking to every kind.
    await stubVideo(page);
    await openBoard(page);
    await addVideoNode(page);
    await collapsePanels(page);
    const [v] = await panelBoxes(page);
    await dragFrom(page, v.x + v.w / 2, v.y + v.h / 2, -380);

    await page.locator("button").nth(1).click();
    await page.waitForTimeout(250);
    await page.locator("button").filter({ hasText: /^Image$/ }).first().click();
    await page.waitForTimeout(800);
    await collapsePanels(page);
    await clickEmpty(page);

    const titles = await page.evaluate(() =>
      [...document.querySelectorAll('div[title="Input"], div[title="Output"]')]
        .map((d) => d.getAttribute("title")).sort());
    // video: Input. image: Input + Output.
    expect(titles).toEqual(["Input", "Input", "Output"]);
  });
});
