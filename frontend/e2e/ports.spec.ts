import { test, expect } from "@playwright/test";
import {
  openBoard, addPanelAt, panelBoxes, tagPanels, panelByBorn,
  dragFrom, clickEmpty, portCount, portCentres, setZoom, topmostPanelAt,
} from "./helpers";

// A port drawn over the node that covers it reads as belonging to that node.
// Ports sit at Z_INDEX.ports, above every placeholder, so they do not occlude
// by themselves. #28 covered image-over-image; these cover the Create Image
// cases, which were missed in both directions.

async function twoPanels(page: import("@playwright/test").Page) {
  await addPanelAt(page, -340);
  await addPanelAt(page, 300);
  await clickEmpty(page);
  await tagPanels(page);
}

test.describe("port occlusion between Create Image nodes", () => {
  test("a covered node's port is hidden, the covering node's stays", async ({ page }) => {
    await openBoard(page);
    await twoPanels(page);
    expect(await portCount(page)).toBe(4); // 2 nodes x (input + output)

    const a = await panelByBorn(page, "0");
    const b = await panelByBorn(page, "1");

    // Drag the OLDER node onto the newer one. It must come forward (array
    // order is paint order) and the node it covers must drop its port.
    await dragFrom(page, a.x + a.w / 2, a.y + a.h / 2, b.x + 30 - a.x, b.y - a.y);

    const a2 = await panelByBorn(page, "0");
    const b2 = await panelByBorn(page, "1");
    const overlap = Math.min(a2.x + a2.w, b2.x + b2.w) - Math.max(a2.x, b2.x);
    expect(overlap).toBeGreaterThan(20);

    // The dragged node is on top.
    const top = await topmostPanelAt(page, Math.round(Math.max(a2.x, b2.x) + 20), Math.round(b2.y + b2.h / 2));
    expect(top).toBe("0");

    const ports = await portCentres(page);
    expect(ports).toHaveLength(3);

    // B's output port sits at its right edge, inside A, so it must be gone.
    expect(ports.find((p) => p.kind === "Output" && Math.abs(p.x - (b2.x + b2.w)) < 8)).toBeUndefined();
    // A is on top, so A's own input port over B stays visible.
    expect(ports.find((p) => p.kind === "Input" && Math.abs(p.x - a2.x) < 8)).toBeDefined();
  });

  // The occlusion point is inset by PORT_WIDTH / (2 * scale), so the test has
  // to hold at zoom levels other than 1.
  for (const level of [0.5, 1, 1.5]) {
    test(`occlusion holds at ${level * 100}% zoom`, async ({ page }) => {
      await openBoard(page);
      await twoPanels(page);
      if (level !== 1) await setZoom(page, level);

      const before = await portCount(page);
      expect(before).toBe(4);

      const [a, b] = (await panelBoxes(page)).sort((p, q) => p.x - q.x);
      await dragFrom(page, a.x + a.w / 2, a.y + a.h / 2, b.x + b.w * 0.15 - a.x, b.y - a.y);

      expect(await portCount(page)).toBeLessThan(before);
    });
  }
});
