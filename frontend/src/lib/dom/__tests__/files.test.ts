// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { pickFile } from "../pickFile";
import { downloadText } from "../download";

afterEach(() => vi.restoreAllMocks());

describe("pickFile", () => {
  it("clicks a fresh input with `accept`, and hands over the file picked", () => {
    const inputs: HTMLInputElement[] = [];
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      inputs.push(this);
    });
    const onPicked = vi.fn();
    pickFile(".json", onPicked);
    pickFile(".json", onPicked);
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).not.toBe(inputs[1]);
    expect(inputs[0].type).toBe("file");
    expect(inputs[0].accept).toBe(".json");

    const file = new File(["{}"], "board.json");
    Object.defineProperty(inputs[0], "files", { value: [file] });
    inputs[0].dispatchEvent(new Event("change"));
    expect(onPicked).toHaveBeenCalledWith(file);
  });

  it("does nothing when the picker closes with no file", () => {
    let input: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      input = this;
    });
    const onPicked = vi.fn();
    pickFile(".md", onPicked);
    input!.dispatchEvent(new Event("change"));
    expect(onPicked).not.toHaveBeenCalled();
  });
});

describe("downloadText", () => {
  it("clicks a link to a blob of the text, then revokes it", () => {
    vi.useFakeTimers();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return "blob:x";
    });
    URL.revokeObjectURL = vi.fn();
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });

    downloadText("a.md", "# hi", "text/markdown");
    expect(clicks[0].download).toBe("a.md");
    expect(clicks[0].href).toBe("blob:x");
    expect(blobs[0].type).toBe("text/markdown");
    expect(blobs[0].size).toBe(4);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    vi.useRealTimers();
  });
});
