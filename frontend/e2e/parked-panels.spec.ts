import { test, expect, type Page } from "@playwright/test";
import { openBoard, activePanelCount, clickEmpty, dragFrom, panelBoxes } from "./helpers";

// #186: a saved node of a kind this build does not know -- from a newer
// branch, or a rolled-back release -- used to crash the whole board. It is now
// set aside: the rest of the board loads, and the node's data survives saves.

const KEY = "gcos-node-panels";

const UNKNOWN = {
  id: "panel-3", kind: "mask", canvasX: 900, canvasY: 300, w: 200, h: 150,
  isActive: false, isPanelOpen: false, label: "my mask",
  draft: { model: "m", instruction: "keep me" },
};

const placeholders = (page: Page) => page.locator("button.node-panel-placeholder").count();
const savedPanels = (page: Page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state.panels as any[], KEY);

test.describe("saved node of an unknown kind (#186)", () => {
  let errors: string[];
  let warnings: string[];

  test.beforeEach(async ({ page }) => {
    errors = [];
    warnings = [];
    // The crash was an uncaught render error, which surfaces as a pageerror.
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && m.text().includes("No spec registered")) errors.push(m.text());
      if (m.type() === "warning" && m.text().includes("unknown kind")) warnings.push(m.text());
    });

    // Seed once: a reload in the test must read what the app saved, not the seed.
    await page.addInitScript(({ k, unknown }) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      const mk = (id: string, kind: string, x: number) => ({
        id, kind, canvasX: x, canvasY: 300, w: 200, h: 150,
        isActive: false, isPanelOpen: false, label: id,
      });
      localStorage.setItem(k, JSON.stringify({
        state: { panels: [mk("panel-1", "image", 200), mk("panel-2", "instruction", 550), unknown] },
        version: 0,
      }));
    }, { k: KEY, unknown: UNKNOWN });
  });

  test("the board loads with the known nodes and one warning", async ({ page }) => {
    await openBoard(page);

    expect(await placeholders(page)).toBe(2);
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"mask"');
    expect(warnings[0]).toContain("1 saved node(s)");
  });

  test("Ctrl+A selects only the known nodes", async ({ page }) => {
    await openBoard(page);
    await clickEmpty(page);
    await page.keyboard.press("ControlOrMeta+a");
    await page.waitForTimeout(300);

    expect(await activePanelCount(page)).toBe(2);
  });

  test("the unknown node is kept across a save, and comes back once its kind is known", async ({ page }) => {
    await openBoard(page);
    const [first] = await panelBoxes(page);
    await dragFrom(page, first.x + first.w / 2, first.y + first.h / 2, 60);
    await page.waitForTimeout(400);   // past the deferred save

    const saved = await savedPanels(page);
    expect(saved).toHaveLength(3);
    expect(saved.find((p) => p.id === "panel-3")).toEqual(UNKNOWN);

    // Stand-in for a build that knows the kind.
    await page.evaluate((k) => {
      const v = JSON.parse(localStorage.getItem(k)!);
      v.state.panels = v.state.panels.map((p: any) => (p.id === "panel-3" ? { ...p, kind: "instruction" } : p));
      localStorage.setItem(k, JSON.stringify(v));
    }, KEY);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => !!(window as any).Konva?.stages?.length);
    await page.waitForTimeout(400);

    expect(await placeholders(page)).toBe(3);
    expect(errors).toEqual([]);
  });
});
