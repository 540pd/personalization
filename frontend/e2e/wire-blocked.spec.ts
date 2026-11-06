import { test, expect, type Page } from "@playwright/test";
import { openBoard, addPanelAt, panelBoxes, uploadImage, imageBox, zoom, type Box } from "./helpers";

// #460: while a wire is dragged, the node under the pointer that can't take
// it shows red on its connector, never the whole node, and says why;
// letting go there makes nothing.

const wires = (page: Page) => page.locator('svg g > path[stroke-width="12"]');
const redPort = (page: Page) => page.locator(".board-port.is-blocked");
const reason = (page: Page) => page.locator(".board-wire-reason");

/** Three Create Image nodes in a row, left to right. */
async function threeNodes(page: Page): Promise<[Box, Box, Box]> {
  await openBoard(page);
  await addPanelAt(page, -380);
  await addPanelAt(page, 0);
  await addPanelAt(page, 380);
  const boxes = (await panelBoxes(page)).sort((a, b) => a.x - b.x);
  expect(boxes).toHaveLength(3);
  return [boxes[0], boxes[1], boxes[2]];
}

/** Zoom with the wheel over empty board above the nodes, as in wire-editing.spec. */
async function zoomTo(page: Page, target: number) {
  for (let i = 0; i < 48 && Math.abs((await zoom(page)) - target) >= 0.02; i++) {
    await page.mouse.move(700, 150);
    await page.mouse.wheel(0, (await zoom(page)) > target ? 120 : -120);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(250);
  expect(await zoom(page)).toBeCloseTo(target, 1);
}

const output = (b: Box) => ({ x: b.x + b.w, y: b.y + b.h * 0.3 });
const input = (b: Box) => ({ x: b.x, y: b.y + b.h * 0.3 });
const body = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h * 0.7 });
const above = (b: Box) => ({ x: b.x + b.w / 2, y: Math.max(40, b.y - 120) });

async function press(page: Page, at: { x: number; y: number }) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
}

async function moveTo(page: Page, at: { x: number; y: number }) {
  await page.mouse.move(at.x, at.y, { steps: 20 });
  await page.waitForTimeout(150);
}

async function release(page: Page) {
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function wire(page: Page, from: Box, to: Box) {
  await press(page, output(from));
  await moveTo(page, body(to));
  await release(page);
}

/**
 * The red port (an input, an output, or none for a node without an input),
 * the reason and the cursor, all at once. Nothing outlines the node.
 */
async function expectRed(page: Page, text: string, port: "input" | "output" | null) {
  await expect(redPort(page)).toHaveCount(port ? 1 : 0);
  if (port === "input") await expect(page.locator(".board-port.is-input.is-blocked")).toHaveCount(1);
  if (port === "output") await expect(page.locator(".board-port:not(.is-input).is-blocked")).toHaveCount(1);
  await expect(page.locator("rect.board-wire-target")).toHaveCount(0);
  await expect(reason(page)).toHaveText(text);
  await expect(reason(page)).toBeVisible();
  await expect(page.locator("html.wire-blocked")).toHaveCount(1);
}

async function expectNoRed(page: Page) {
  await expect(redPort(page)).toHaveCount(0);
  // Mounted, empty, for the whole drag; gone after it.
  await expect(reason(page)).toBeHidden();
  await expect(page.locator("html.wire-blocked")).toHaveCount(0);
}

test.describe("a node that can't take a wire (#460)", () => {
  for (const level of [0.5, 1, 1.5]) {
    test(`a node already wired from the source is red at ${level * 100}% zoom, and letting go makes nothing`, async ({ page }) => {
      let [a, b] = await threeNodes(page);
      if (level !== 1) {
        await zoomTo(page, level);
        [a, b] = (await panelBoxes(page)).sort((p, q) => p.x - q.x);
      }
      await wire(page, a, b);

      await press(page, output(a));
      await moveTo(page, body(b));
      await expectRed(page, "Already connected", "input");
      // The other node can still take it, and stays blue.
      await expect(page.locator(".board-port.is-target")).toHaveCount(1);
      await release(page);

      await expect(wires(page)).toHaveCount(1);
      await expectNoRed(page);
      // No undo step for the drop: one undo takes back the first wire.
      await page.keyboard.press("ControlOrMeta+z");
      await expect(wires(page)).toHaveCount(0);
    });
  }

  test("a wire that would close a loop of two or three is red", async ({ page }) => {
    await threeNodes(page);
    // C's output is past the page's right edge at 100%.
    await zoomTo(page, 0.5);
    const [a, b, c] = (await panelBoxes(page)).sort((p, q) => p.x - q.x);
    await wire(page, a, b);
    await wire(page, b, c);

    await press(page, output(b));
    await moveTo(page, body(a));
    await expectRed(page, "This would make a loop", "input");
    await release(page);

    await press(page, output(c));
    await moveTo(page, above(a));
    await moveTo(page, body(a));
    await expectRed(page, "This would make a loop", "input");
    await release(page);
    await expect(wires(page)).toHaveCount(2);
  });

  test("near a blocked node's input, with no port in reach that can take the wire, is red", async ({ page }) => {
    const [a, b] = await threeNodes(page);
    await wire(page, a, b);
    await press(page, output(a));
    const p = input(b);
    await moveTo(page, { x: p.x - 20, y: p.y - 18 });
    await expectRed(page, "Already connected", "input");
    await release(page);
  });

  test("the source is red only once the pointer has left it and come back", async ({ page }) => {
    const [a] = await threeNodes(page);
    await press(page, output(a));
    await moveTo(page, body(a));
    await expectNoRed(page);
    await moveTo(page, above(a));
    await moveTo(page, body(a));
    await expectRed(page, "Can't connect a node to itself", "input");
    await release(page);
    await expect(wires(page)).toHaveCount(0);
  });

  test("a Compose node and an image on the board don't take inputs", async ({ page }) => {
    await openBoard(page);
    await addPanelAt(page, -420);
    const [a] = await panelBoxes(page);

    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForTimeout(250);
    await page.locator(".floating-dock-submenu button").filter({ hasText: /^Compose$/ }).first().click();
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const compose = (await page.getByText("Double-click to write").boundingBox())!;

    await press(page, output(a));
    await moveTo(page, { x: compose.x + compose.width / 2, y: compose.y + compose.height / 2 });
    await expectRed(page, "This node doesn't take inputs", null);
    await release(page);
    await expect(wires(page)).toHaveCount(0);

    // Out of the way, so the image lands on empty board.
    await page.getByText("Double-click to write").click();
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);
    await uploadImage(page, 300, 200);
    const img = await imageBox(page);
    await press(page, output(a));
    await moveTo(page, { x: img.x + img.w / 2, y: img.y + img.h / 2 });
    await expectRed(page, "This node doesn't take inputs", null);
    await release(page);
    await expect(wires(page)).toHaveCount(0);
  });

  test("another node's output port is red, and letting go there makes nothing", async ({ page }) => {
    const [a, b] = await threeNodes(page);
    await press(page, output(a));
    await moveTo(page, above(b));
    await moveTo(page, output(b));
    await expectRed(page, "An output can't connect to another output", "output");
    await release(page);
    await expect(wires(page)).toHaveCount(0);
    await expectNoRed(page);

    // Back on the wire's own output, after leaving it.
    await press(page, output(a));
    await moveTo(page, above(a));
    await moveTo(page, output(a));
    await expectRed(page, "Can't connect a node to itself", "output");
    await release(page);
    await expect(wires(page)).toHaveCount(0);
  });

  test("an image's output on the board is red too", async ({ page }) => {
    await openBoard(page);
    await addPanelAt(page, -420);
    const [a] = await panelBoxes(page);
    await uploadImage(page, 300, 200);
    const img = await imageBox(page);
    await press(page, output(a));
    await moveTo(page, { x: img.x + img.w / 2, y: Math.max(40, img.y - 80) });
    await moveTo(page, { x: img.x + img.w, y: img.y + img.h * 0.3 });
    await expectRed(page, "An output can't connect to another output", "output");
    await release(page);
    await expect(wires(page)).toHaveCount(0);
  });

  test("a moved wire let go on a red node is removed, and undo puts it back", async ({ page }) => {
    const [a, b, c] = await threeNodes(page);
    await wire(page, a, b);
    await wire(page, a, c);

    await press(page, input(b));
    await moveTo(page, body(c));
    await expectRed(page, "Already connected", "input");
    await release(page);
    await expect(wires(page)).toHaveCount(1);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(wires(page)).toHaveCount(2);
  });

  test("no node shows its hover outline while a wire is dragged", async ({ page }) => {
    await openBoard(page);
    await addPanelAt(page, -420);
    await addPanelAt(page, 0);
    const [a, b] = (await panelBoxes(page)).sort((p, q) => p.x - q.x);
    const outlines = page.locator(".node-hover-outline");

    // Over a node, at rest and not selected: it has its outline.
    await page.mouse.click(1000, 150);
    await page.mouse.move(body(b).x, body(b).y, { steps: 5 });
    await expect(outlines).toHaveCount(1);

    // The press on A's output, and any node passed over, shows none.
    await press(page, output(a));
    await expect(outlines).toHaveCount(0);
    await moveTo(page, body(b));
    await expect(outlines).toHaveCount(0);
    await moveTo(page, body(a));
    await expect(outlines).toHaveCount(0);
    await release(page);

    // An image on the board neither.
    await uploadImage(page, 300, 200);
    const img = await imageBox(page);
    const konvaOutline = () =>
      page.evaluate(() => (window as any).Konva.stages[0].findOne(".hover-outline")?.visible() ?? false);
    await page.mouse.click(1000, 150);
    await page.mouse.move(img.x + img.w / 2, img.y + img.h / 2, { steps: 5 });
    await expect.poll(konvaOutline).toBe(true);
    await press(page, output(a));
    await moveTo(page, { x: img.x + img.w / 2, y: img.y + img.h / 2 });
    expect(await konvaOutline()).toBe(false);
    await release(page);
  });

  test("Escape while red clears the red and the reason", async ({ page }) => {
    const [a, b] = await threeNodes(page);
    await wire(page, a, b);
    await press(page, output(a));
    await moveTo(page, body(b));
    await expectRed(page, "Already connected", "input");
    await page.keyboard.press("Escape");
    await expectNoRed(page);
    await release(page);
    await expect(wires(page)).toHaveCount(1);
  });
});
