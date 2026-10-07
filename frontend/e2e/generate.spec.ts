import { test, expect, type Page, type Route } from "@playwright/test";
import { openBoard, addPanel, collapsePanels, panelBoxes, dragFrom, makePng } from "./helpers";

// Covers the generate path and the reference collection that feeds it: a
// node's output is typed (image / video / text), and only an image output can
// currently travel upstream as a reference.
//
// The backend is not exercised. These intercept /api/proxy/** so the request
// body can be asserted -- the point is what the canvas sends, not what Vertex
// returns.

const FAKE_IMAGE = `data:image/png;base64,${makePng(8, 8).toString("base64")}`;

/** Intercept generation and record every request body sent. */
async function stubGenerate(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/proxy/**", async (route: Route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    try {
      bodies.push(req.postDataJSON());
    } catch {
      bodies.push({});
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        jobId: "test-job",
        status: "done",
        imageUrl: FAKE_IMAGE,
        modelUsed: "gemini-3.1-flash-image",
      }),
    });
  });
  return bodies;
}

async function generateInOpenPanel(page: Page, instruction: string) {
  await page.locator("textarea").first().fill(instruction);
  await page.waitForTimeout(150);
  await page.locator("button:has-text('Create')").first().click();
  await page.waitForTimeout(1200);
}

test.describe("generation and references", () => {
  test("a completed generation becomes an image output and renders", async ({ page }) => {
    await stubGenerate(page);
    await openBoard(page);
    await addPanel(page);

    await generateInOpenPanel(page, "a brass diving helmet");
    await collapsePanels(page);

    // The typed output drives the preview; nothing renders unless type is "image".
    await expect(page.locator("img.node-panel-preview")).toHaveCount(1);

    // Escape deselected the node, and the name only renders while a node is
    // active, so select it again before looking for the label.
    const [node] = await panelBoxes(page);
    await page.mouse.click(node.x + 12, node.y + 12);
    await page.waitForTimeout(400);
    // The name is seeded from the instruction on first generate.
    await expect(page.locator('div[title="a brass diving helmet"]')).toHaveCount(1);
  });

  test("a node with no output contributes no reference", async ({ page }) => {
    const bodies = await stubGenerate(page);
    await openBoard(page);
    await addPanel(page);

    await generateInOpenPanel(page, "lone node");

    expect(bodies).toHaveLength(1);
    expect(bodies[0].references).toBeUndefined();
  });

  test("an upstream image output travels as a named reference", async ({ page }) => {
    const bodies = await stubGenerate(page);
    await openBoard(page);

    // Upstream node: generate so it has an image output and a name.
    await addPanel(page);
    await generateInOpenPanel(page, "harbour at dusk");
    await collapsePanels(page);
    const [up] = await panelBoxes(page);
    // Move it clear so the second node does not land on top of it.
    await dragFrom(page, up.x + up.w / 2, up.y + up.h / 2, -380);

    // Downstream node.
    await addPanel(page);
    await collapsePanels(page);
    // At the default 320px width both nodes sit left of centre, so split them
    // by relative position rather than an absolute x.
    const boxes = (await panelBoxes(page)).sort((a, b) => a.x - b.x);
    const source = boxes[0];
    const target = boxes[1];

    // Drag from the source's output port to the target's input port. Ports sit
    // PORT_FRACTION down each node; the drop snaps within SNAP_RADIUS.
    const outPt = { x: source.x + source.w - 2, y: source.y + source.h * 0.3 };
    const inPt = { x: target.x + 2, y: target.y + target.h * 0.3 };
    await page.mouse.move(outPt.x, outPt.y);
    await page.mouse.down();
    await page.mouse.move(inPt.x, inPt.y, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    // Open the downstream node and generate.
    await page.mouse.click(target.x + 12, target.y + 12);
    await page.waitForTimeout(300);
    await page.mouse.click(target.x + 12, target.y + 12);
    await page.waitForTimeout(600);
    await generateInOpenPanel(page, "put the helmet on the quay");

    const last = bodies[bodies.length - 1] as {
      references?: { kind: string; url?: string; name?: string }[];
    };
    expect(last.references).toBeDefined();
    expect(last.references).toHaveLength(1);
    // Discriminated: an image reference points at a data URL, a text one
    // carries its content.
    expect(last.references![0].kind).toBe("image");
    expect(last.references![0].url).toBe(FAKE_IMAGE);
    // The name is what lets an instruction say which reference it means.
    expect(last.references![0].name).toBe("harbour at dusk");
  });
});
