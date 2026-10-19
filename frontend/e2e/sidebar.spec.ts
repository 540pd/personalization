import { test, expect } from "@playwright/test";
import { openBoard, addPanel, uploadImage, imageBox, setZoom } from "./helpers";

const SIDEBAR_WIDTH = 200;
const RAIL_WIDTH = 64;

/** The rail's width once its 150ms transition has settled. */
async function railWidth(page: import("@playwright/test").Page) {
  await page.waitForTimeout(250);
  const box = await page.locator(".sidebar").boundingBox();
  return Math.round(box!.width);
}

async function minimize(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator(".sidebar-minimized")).toBeVisible();
  // Let the 150ms width transition finish: a hover aimed mid-transition
  // lands where the icon was, not where it settles.
  await page.waitForTimeout(250);
}

/** The tooltip attached to the control with this accessible name. */
function tipFor(page: import("@playwright/test").Page, name: string) {
  return page
    .locator(".tooltip-anchor", { has: page.getByRole("button", { name, exact: true }) })
    .locator(".tooltip");
}

/** Opacity of the tooltip attached to the control with this accessible name. */
async function tipOpacity(page: import("@playwright/test").Page, name: string) {
  return Number(await tipFor(page, name).evaluate((e) => getComputedStyle(e).opacity));
}

/** Where a newly created node's centre sits, in screen px. */
async function newNodeCentre(page: import("@playwright/test").Page) {
  const box = await page.locator("button.node-panel-placeholder").first().boundingBox();
  return box!.x + box!.width / 2;
}

test.describe("sidebar", () => {
  test("renders the three zones from the reference", async ({ page }) => {
    await openBoard(page);
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".sidebar-product")).toContainText("Studio");
    await expect(page.locator(".sidebar-product")).toContainText("PlaySpace");
    // The brand label was dropped; the nav starts straight at the items.
    await expect(page.locator(".sidebar-brand-label")).toHaveCount(0);
    await expect(page.locator(".sidebar-item")).toHaveCount(5);
    await expect(page.locator(".sidebar-support")).toBeVisible();
  });

  test("fits its content at the narrowed width", async ({ page }) => {
    // 200 is the floor plus slack, and the floor is set by the header
    // lockup and the identity row -- not by the nav items, which need ~138.
    // If either grows, this fails rather than silently clipping.
    await openBoard(page);
    const rail = await page.locator(".sidebar").boundingBox();
    expect(Math.round(rail!.width)).toBe(SIDEBAR_WIDTH);

    const clipped = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          ".sidebar-product, .sidebar-identity-name, .sidebar-item-label"
        )
      )
        .filter((e) => e.scrollWidth > e.clientWidth)
        .map((e) => e.textContent)
    );
    expect(clipped).toEqual([]);
  });

  test("the user menu matches the rail and truncates a long address", async ({ page }) => {
    // The menu is anchored to the identity row at the rail's width, so it
    // reads as part of the nav (cbee571). A long address is cut with an
    // ellipsis rather than widening it; the full value stays on hover.
    await openBoard(page);
    await page.locator(".sidebar-identity").click();

    const menu = await page.evaluate(() => {
      const rail = document.querySelector(".sidebar")!.getBoundingClientRect();
      const email = document.querySelector(".sidebar-user-email") as HTMLElement;
      const box = document.querySelector(".sidebar-user-menu")!.getBoundingClientRect();
      return {
        insideRail: box.left >= rail.left && box.right <= rail.right,
        ellipsis: getComputedStyle(email).textOverflow,
        fullOnHover: email.title === email.textContent?.trim() && email.title.length > 0,
        onScreen: box.left >= 0 && box.right <= window.innerWidth,
      };
    });
    expect(menu).toEqual({ insideRail: true, ellipsis: "ellipsis", fullOnHover: true, onScreen: true });
  });

  test("marks exactly one destination active", async ({ page }) => {
    await openBoard(page);
    await expect(page.locator(".sidebar-item-active")).toHaveCount(1);
    await expect(page.locator(".sidebar-item-active")).toContainText("Playspace");
  });

  test("only Playspace, Skills and Agents are clickable; the rest are placeholders", async ({ page }) => {
    await openBoard(page);
    for (const label of ["Playspace", "Skills", "Agents"]) {
      await expect(page.locator(".sidebar-item", { hasText: label })).toBeEnabled();
    }

    for (const label of ["Assets", "Usage"]) {
      await expect(page.locator(".sidebar-item", { hasText: label })).toBeDisabled();
    }
    await expect(page.locator(".sidebar-item-unavailable")).toHaveCount(2);
  });

  test("a placeholder cannot steal the active state", async ({ page }) => {
    // force: true bypasses actionability, so this presses the element even
    // though it is disabled -- otherwise the test passes because Playwright
    // declined to click, not because the app refused.
    await openBoard(page);
    await page.locator(".sidebar-item", { hasText: "Assets" }).click({ force: true });
    await expect(page.locator(".sidebar-item-active")).toContainText("Playspace");
  });

  test("placeholders are out of the tab order", async ({ page }) => {
    await openBoard(page);
    const focusable = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar-item")).filter(
          (b) => !b.disabled
        ).length
    );
    // Playspace, Skills (#206) and Agents (#208).
    expect(focusable).toBe(3);
  });

  test("minimizes to an icon rail instead of disappearing, and expands again", async ({ page }) => {
    await openBoard(page);
    await minimize(page);
    await expect(page.locator(".sidebar")).toBeVisible();
    expect(await railWidth(page)).toBe(RAIL_WIDTH);
    // The floating re-open button belonged to the hidden mode, which is gone.
    await expect(page.locator(".sidebar-reopen")).toHaveCount(0);

    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(page.locator(".sidebar-minimized")).toHaveCount(0);
    expect(await railWidth(page)).toBe(SIDEBAR_WIDTH);
  });

  test.describe("minimized", () => {
    test("keeps every destination, in the same order, with labels only for assistive tech", async ({ page }) => {
      await openBoard(page);
      const order = () => page.locator(".sidebar-nav .sidebar-item").allTextContents();
      const expanded = await order();
      await minimize(page);
      expect(await order()).toEqual(expanded);

      // Found by name in both modes: the label is visually hidden, not removed.
      await expect(page.getByRole("button", { name: "Playspace" })).toBeVisible();
      const labelWidth = await page
        .locator(".sidebar-nav .sidebar-item-label")
        .first()
        .evaluate((e) => e.getBoundingClientRect().width);
      expect(labelWidth).toBeLessThanOrEqual(1);
    });

    test("marks the active destination and keeps placeholders inert", async ({ page }) => {
      await openBoard(page);
      await minimize(page);
      await expect(page.locator(".sidebar-item-active")).toHaveCount(1);
      await expect(page.locator(".sidebar-item-active")).toHaveAccessibleName("Playspace");
      for (const label of ["Assets", "Usage"]) {
        await expect(page.getByRole("button", { name: label })).toBeDisabled();
      }
      await page.getByRole("button", { name: "Assets" }).click({ force: true });
      await expect(page.locator(".sidebar-item-active")).toHaveAccessibleName("Playspace");
    });

    test("labels an icon on hover, after a delay, beside the rail", async ({ page }) => {
      await openBoard(page);
      await minimize(page);
      await page.getByRole("button", { name: "Playspace" }).hover();
      // Not at once: sweeping down the column must not flash every label.
      expect(await tipOpacity(page, "Playspace")).toBe(0);
      await expect.poll(() => tipOpacity(page, "Playspace")).toBe(1);

      const tip = tipFor(page, "Playspace");
      // The active Playspace icon opens its options when minimized (#197), and
      // its label says so.
      await expect(tip).toHaveText("Playspace · options");
      const box = await tip.boundingBox();
      expect(box!.x).toBeGreaterThan(RAIL_WIDTH);

      await page.mouse.move(700, 300);
      await expect.poll(() => tipOpacity(page, "Playspace")).toBe(0);
    });

    test("labels a disabled placeholder as coming soon", async ({ page }) => {
      // The case a native title gets wrong: disabled buttons swallow the
      // mouse events it relies on.
      await openBoard(page);
      await minimize(page);
      await page.getByRole("button", { name: "Assets" }).hover({ force: true });
      await expect.poll(() => tipOpacity(page, "Assets")).toBe(1);
      await expect(tipFor(page, "Assets")).toHaveText("Assets · Coming soon");
    });

    test("labels the focused icon for keyboard users, and Escape hides it", async ({ page }) => {
      await openBoard(page);
      await minimize(page);
      await page.getByRole("button", { name: "Expand sidebar" }).focus();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Playspace" })).toBeFocused();
      await expect.poll(() => tipOpacity(page, "Playspace")).toBe(1);

      await page.keyboard.press("Escape");
      await expect.poll(() => tipOpacity(page, "Playspace")).toBe(0);
    });

    test("keeps the toggle focused across the switch", async ({ page }) => {
      // The toggle must not remount when the mode changes, or a keyboard
      // user who pressed it is dropped back to the top of the page.
      await openBoard(page);
      await page.getByRole("button", { name: "Collapse sidebar" }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeFocused();
    });

    test("opens the user menu beside the rail, at full width", async ({ page }) => {
      await openBoard(page);
      await minimize(page);
      await page.locator(".sidebar-identity").click();
      const menu = page.locator(".sidebar-user-menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Brand" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();

      const box = await menu.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(RAIL_WIDTH);
      const clipped = await menu
        .locator(".sidebar-user-email")
        .evaluate((e) => e.scrollWidth > e.clientWidth);
      expect(clipped).toBe(false);

      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
    });

    test("is remembered across a reload, in both directions", async ({ page }) => {
      await openBoard(page);
      await minimize(page);
      await openBoard(page);
      await expect(page.locator(".sidebar-minimized")).toBeVisible();
      expect(await railWidth(page)).toBe(RAIL_WIDTH);

      await page.getByRole("button", { name: "Expand sidebar" }).click();
      await openBoard(page);
      await expect(page.locator(".sidebar-minimized")).toHaveCount(0);
      expect(await railWidth(page)).toBe(SIDEBAR_WIDTH);
    });

    test("falls back to expanded when the saved mode is unreadable", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("gcos-sidebar-collapsed", "{not json"));
      await openBoard(page);
      await expect(page.locator(".sidebar-minimized")).toHaveCount(0);
    });
  });

  // The real risk. Six places worked out a centre from window.innerWidth and
  // would quietly place things behind the rail.
  test.describe("the canvas knows the rail is there", () => {
    test("a new node is centred on the canvas, not the window", async ({ page }) => {
      await openBoard(page);
      await addPanel(page);

      const withRail = await newNodeCentre(page);
      const windowCentre = await page.evaluate(() => window.innerWidth / 2);

      // Centred on the visible span, so half a rail to the right of the
      // window's middle — and clear of the rail either way.
      expect(withRail).toBeGreaterThan(SIDEBAR_WIDTH);
      expect(withRail - windowCentre).toBeGreaterThan(SIDEBAR_WIDTH / 2 - 40);
      expect(withRail - windowCentre).toBeLessThan(SIDEBAR_WIDTH / 2 + 40);
    });

    test("minimizing the rail centres on the wider canvas, still clear of the rail", async ({ page }) => {
      await openBoard(page);
      await page.locator(".sidebar-collapse-button").click();
      await addPanel(page);

      // Half the icon rail right of the window's middle.
      const centre = await newNodeCentre(page);
      const windowCentre = await page.evaluate(() => window.innerWidth / 2);
      expect(Math.abs(centre - (windowCentre + RAIL_WIDTH / 2))).toBeLessThan(40);

      const box = await page.locator("button.node-panel-placeholder").first().boundingBox();
      expect(box!.x).toBeGreaterThan(RAIL_WIDTH);
    });

    test("an uploaded image lands clear of the rail", async ({ page }) => {
      await openBoard(page);
      await uploadImage(page, 1600, 900);
      const box = await imageBox(page);
      expect(box.x).toBeGreaterThan(SIDEBAR_WIDTH);
    });

    test("the dock does not move when the rail toggles", async ({ page }) => {
      // Deliberately pinned to the window, unlike node placement. A tool
      // palette that slides sideways on an unrelated action costs more in
      // muscle memory than being exactly centred over the canvas gains.
      await openBoard(page);
      const dockCentre = async () => {
        const b = await page.locator(".floating-dock-wrapper").boundingBox();
        return b!.x + b!.width / 2;
      };

      const open = await dockCentre();
      await page.locator(".sidebar-collapse-button").click();
      const closed = await dockCentre();

      expect(Math.abs(open - closed)).toBeLessThan(2);
      const windowCentre = await page.evaluate(() => window.innerWidth / 2);
      expect(Math.abs(open - windowCentre)).toBeLessThan(2);
    });

    test("the dock still clears the rail", async ({ page }) => {
      // The cost of pinning it: it is left of the visible centre. Only a
      // problem if it reaches the rail, which this pins.
      await openBoard(page);
      const dock = await page.locator(".floating-dock-wrapper").boundingBox();
      expect(dock!.x).toBeGreaterThan(SIDEBAR_WIDTH);
    });

    test("the zoom bar sits beside the rail in both states", async ({ page }) => {
      // #204: it used to be hidden beside the full rail. Now it follows the
      // canvas edge, 24px clear of whichever rail is showing.
      await openBoard(page);
      await expect(page.locator(".minimap-container")).toBeVisible();
      let bar = await page.locator(".minimap-container").boundingBox();
      expect(bar!.x).toBeGreaterThanOrEqual(SIDEBAR_WIDTH + 24 - 1);

      await page.locator(".sidebar-collapse-button").click();
      await page.waitForTimeout(250);
      bar = await page.locator(".minimap-container").boundingBox();
      expect(bar!.x).toBeGreaterThan(RAIL_WIDTH);
      expect(bar!.x).toBeLessThan(SIDEBAR_WIDTH);
    });

    test("zoom shortcuts work with the rail expanded", async ({ page }) => {
      await openBoard(page);
      await expect(page.locator(".minimap-container")).toBeVisible();

      await setZoom(page, 0.5);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scale = () => page.evaluate(() => (window as any).Konva.stages[0].scaleX() as number);
      expect(await scale()).toBeLessThan(0.9);

      await page.keyboard.press("Shift+Digit0");
      await page.waitForTimeout(200);
      expect(await scale()).toBeCloseTo(1, 2);
    });
  });

  test.describe("identity", () => {
    // Dev builds carry a stub identity so the footer is clickable. It is
    // gated on NODE_ENV as well as the env var, so it cannot reach a
    // deployed build even if the var is set there by mistake.
    test("shows the signed-in user", async ({ page }) => {
      await openBoard(page);
      await expect(page.locator(".sidebar-identity")).toContainText("Abhimanyu Mahato");
      await expect(page.locator(".sidebar-identity-anonymous")).toHaveCount(0);
    });

    test("opens a menu with the email, Brand and Sign out", async ({ page }) => {
      await openBoard(page);
      await expect(page.locator(".sidebar-user-menu")).toHaveCount(0);

      await page.locator(".sidebar-identity").click();
      const menu = page.locator(".sidebar-user-menu");
      await expect(menu).toBeVisible();
      await expect(menu.locator(".sidebar-user-email")).toContainText("@accenture.com");
      await expect(menu.getByRole("menuitem", { name: "Brand" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
    });

    test("closes on Escape and on an outside click", async ({ page }) => {
      await openBoard(page);
      await page.locator(".sidebar-identity").click();
      await page.keyboard.press("Escape");
      await expect(page.locator(".sidebar-user-menu")).toHaveCount(0);

      await page.locator(".sidebar-identity").click();
      await expect(page.locator(".sidebar-user-menu")).toBeVisible();
      await page.mouse.click(900, 300);
      await expect(page.locator(".sidebar-user-menu")).toHaveCount(0);
    });

    test("signing out locally falls back to the signed-out state", async ({ page }) => {
      // The point of wiring sign-out in dev: both states are reachable
      // without editing env vars and restarting.
      await openBoard(page);
      await page.locator(".sidebar-identity").click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();

      await expect(page.locator(".sidebar-identity-anonymous")).toBeVisible();
      await expect(page.locator(".sidebar-user-menu")).toHaveCount(0);
    });
  });
});
