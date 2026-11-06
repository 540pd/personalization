// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { AssetView } from "@/api/assets.api";

const api = vi.hoisted(() => ({ listImageAssets: vi.fn(), uploadAsset: vi.fn() }));
vi.mock("@/api/assets.api", () => api);
const files = vi.hoisted(() => ({ pickFile: vi.fn() }));
vi.mock("@/lib/dom/pickFile", () => files);

import ImagePicker, { assetLabel, type PickedImage } from "..";

const asset = (id: string, over: Partial<AssetView> = {}): AssetView => ({
  id,
  url: `/api/proxy/assets/${id}/content`,
  mimeType: "image/png",
  bytes: 10,
  source: "upload",
  createdAt: "2026-10-29T10:00:00Z",
  ...over,
});

/** The picker with its value kept, as a page would; `changes` records each onChange. */
function Harness({ initial = null, changes }: { initial?: PickedImage | null; changes: (PickedImage | null)[] }) {
  const [value, setValue] = useState<PickedImage | null>(initial);
  return (
    <ImagePicker
      label="Choose a logo"
      value={value}
      onChange={(v) => {
        changes.push(v);
        setValue(v);
      }}
    />
  );
}

beforeEach(() => {
  api.listImageAssets.mockResolvedValue([asset("a1"), asset("a2", { source: "generated" })]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ImagePicker (#408)", () => {
  it("starts with Choose image and opens a named dialog of the user's images", async () => {
    render(<Harness changes={[]} />);
    const trigger = screen.getByRole("button", { name: "Choose image" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Choose a logo" })).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Loading your assets").getAttribute("aria-busy")).toBe("true");
    const tiles = await screen.findAllByRole("button", { name: /· / });
    expect(tiles.map((t) => t.textContent)).toEqual([assetLabel(asset("a1")), assetLabel(asset("a2", { source: "generated" }))]);
    expect(tiles[0].textContent).toMatch(/^Uploaded · /);
    expect(tiles[1].textContent).toMatch(/^Generated · /);
    expect(screen.getByText("Uploads are added to Assets too.")).toBeTruthy();
  });

  it("picking a tile chooses it, closes, returns focus, and shows Change and remove", async () => {
    const changes: (PickedImage | null)[] = [];
    render(<Harness changes={changes} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose image" }));
    fireEvent.click((await screen.findAllByRole("button", { name: /^Uploaded/ }))[0]);
    expect(changes[0]).toMatchObject({ id: "a1", url: "/api/proxy/assets/a1/content" });
    expect(screen.queryByRole("dialog")).toBeNull();
    const change = screen.getByRole("button", { name: "Change" });
    expect(document.activeElement).toBe(change);
    expect(screen.getByText(changes[0]!.name)).toBeTruthy();

    // Reopened, the chosen tile is marked.
    fireEvent.click(change);
    const chosen = (await screen.findAllByRole("button", { name: /· / }))[0];
    expect(chosen.getAttribute("aria-pressed")).toBe("true");
    expect(chosen.className).toContain("is-chosen");
  });

  it("remove clears the choice without touching the asset", async () => {
    const changes: (PickedImage | null)[] = [];
    render(<Harness changes={changes} initial={{ id: "a1", url: "/x", name: "logo.png" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(changes).toEqual([null]);
    expect(screen.getByRole("button", { name: "Choose image" })).toBeTruthy();
    expect(api.uploadAsset).not.toHaveBeenCalled();
  });

  it("shows only an empty message when there are no images", async () => {
    api.listImageAssets.mockResolvedValue([]);
    render(<Harness changes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose image" }));
    expect(await screen.findByText("No images in Assets yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload image" })).toBeTruthy();
  });

  it("says when the list fails, and Retry loads it again", async () => {
    api.listImageAssets.mockRejectedValueOnce(new Error("offline"));
    render(<Harness changes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose image" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load your assets");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findAllByRole("button", { name: /· / })).toHaveLength(2);
    expect(api.listImageAssets).toHaveBeenCalledTimes(2);
  });

  it("uploads a picked file, shows it busy, and chooses it under its file name", async () => {
    const changes: (PickedImage | null)[] = [];
    let finish!: (a: AssetView) => void;
    api.uploadAsset.mockReturnValue(new Promise((r) => (finish = r)));
    files.pickFile.mockImplementation((accept: string, onPicked: (f: File) => void) => {
      expect(accept).toBe("image/*");
      onPicked(new File(["x"], "brand-logo.png", { type: "image/png" }));
    });
    render(<Harness changes={changes} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose image" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload image" }));
    const busy = await screen.findByRole("button", { name: "Uploading…" });
    expect(busy.hasAttribute("disabled")).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    await act(async () => finish(asset("new")));
    expect(changes[0]).toEqual({ id: "new", url: "/api/proxy/assets/new/content", name: "brand-logo.png" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("brand-logo.png")).toBeTruthy();
  });

  it("says why an upload failed, and chooses nothing", async () => {
    const changes: (PickedImage | null)[] = [];
    api.uploadAsset.mockRejectedValue(new Error("Too large to save (25 MB at most)"));
    files.pickFile.mockImplementation((_: string, onPicked: (f: File) => void) => onPicked(new File(["x"], "big.png")));
    render(<Harness changes={changes} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose image" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload image" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Too large to save (25 MB at most)"));
    expect(changes).toEqual([]);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes on Escape, giving focus back without reaching the page, and on a press outside", async () => {
    const pageEsc = vi.fn();
    window.addEventListener("keydown", pageEsc);
    render(
      <div>
        <Harness changes={[]} />
        <p>outside</p>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose image" }));
    await screen.findAllByRole("button", { name: /· / });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Choose image" }));
    // Claimed: a page-level Escape (Brand's close, #405) never sees it.
    expect(pageEsc).not.toHaveBeenCalled();
    window.removeEventListener("keydown", pageEsc);

    fireEvent.click(screen.getByRole("button", { name: "Choose image" }));
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
