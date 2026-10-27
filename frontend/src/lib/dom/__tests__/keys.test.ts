// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { dialogIsOpen, isEditableTarget, isInDialog, isMacPlatform, isPageKey, modKeyLabel, modShortcut } from "../keys";
import { disposeAll, listen } from "../listen";

const el = (html: string) => {
  document.body.innerHTML = html;
  return document.body.querySelector("[data-t]") as HTMLElement;
};
const keyOn = (target: HTMLElement) => {
  const e = new KeyboardEvent("keydown", { bubbles: true });
  Object.defineProperty(e, "target", { value: target });
  return e;
};

afterEach(() => { document.body.innerHTML = ""; });

describe("isEditableTarget", () => {
  it.each([
    ["input", '<input data-t>'],
    ["textarea", "<textarea data-t></textarea>"],
    ["select", "<select data-t></select>"],
  ])("a %s is", (_, html) => expect(isEditableTarget(el(html))).toBe(true));

  it("contentEditable is", () => {
    const t = el('<div data-t contenteditable="true"></div>');
    // jsdom does not compute isContentEditable from the attribute.
    Object.defineProperty(t, "isContentEditable", { value: true });
    expect(isEditableTarget(t)).toBe(true);
  });

  it("a button, the body, or nothing is not", () => {
    expect(isEditableTarget(el("<button data-t></button>"))).toBe(false);
    expect(isEditableTarget(document.body)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("isInDialog / isPageKey", () => {
  it("a button inside a modal is in a dialog; its keys are not the page's", () => {
    const t = el('<div aria-modal="true"><button data-t></button></div>');
    expect(isInDialog(t)).toBe(true);
    expect(isPageKey(keyOn(t))).toBe(false);
  });

  it("dialogIsOpen sees a modal anywhere on the page", () => {
    expect(dialogIsOpen()).toBe(false);
    el('<div aria-modal="true"><span data-t></span></div>');
    expect(dialogIsOpen()).toBe(true);
  });

  it("a non-modal dialog does not count", () => {
    expect(isInDialog(el('<div role="dialog"><button data-t></button></div>'))).toBe(false);
  });

  it("a key on a plain button is the page's; one in a field is not", () => {
    expect(isPageKey(keyOn(el("<button data-t></button>")))).toBe(true);
    expect(isPageKey(keyOn(el("<input data-t>")))).toBe(false);
  });
});

describe("listen / disposeAll", () => {
  it("returns what removes the listener, options included", () => {
    const fn = vi.fn();
    const off = listen(window, "keydown", fn, { capture: true });
    window.dispatchEvent(new KeyboardEvent("keydown"));
    off();
    window.dispatchEvent(new KeyboardEvent("keydown"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("disposeAll runs every disposer once and empties the list", () => {
    const order: number[] = [];
    const list = [() => order.push(1), () => order.push(2)];
    disposeAll(list);
    expect(order).toEqual([2, 1]);
    expect(list).toHaveLength(0);
  });
});

describe("modKeyLabel", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it.each([
    ["MacIntel", true, "⌘", "⌘U"],
    ["iPhone", true, "⌘", "⌘U"],
    ["Win32", false, "Ctrl", "Ctrl+U"],
    ["Linux x86_64", false, "Ctrl", "Ctrl+U"],
  ])("on %s", (platform, mac, label, shortcut) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    expect(isMacPlatform()).toBe(mac);
    expect(modKeyLabel()).toBe(label);
    expect(modShortcut("U")).toBe(shortcut);
  });
});
