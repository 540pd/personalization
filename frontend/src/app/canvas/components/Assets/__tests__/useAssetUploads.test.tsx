// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { File as NodeFile } from "node:buffer";
import type { AssetView, BrandAssetsView } from "@/api/brandAssets.api";
import { draftFrom, removeImage, type AssetsDraft } from "../../../assets/assetsDraft";

// What an upload leaves behind when its tile goes (#463).

const api = vi.hoisted(() => ({ uploadPageAsset: vi.fn(), deleteAsset: vi.fn() }));
vi.mock("@/api/brandAssets.api", () => api);

const { useAssetUploads } = await import("../useAssetUploads");

const asset = (id: string, name: string): AssetView => ({
  id, url: `/api/proxy/assets/${id}/content`, mimeType: "image/png", bytes: 3, source: "upload",
  createdAt: "2026-11-03T10:00:00Z", kind: "reference", name, description: "", details: {},
});
const empty: BrandAssetsView = {
  revision: 1, updatedAt: null, assets: [],
  record: { productName: "", sku: "", masterId: "", colours: { primary: "", secondary: "", accent: "" }, assetIds: [] },
};
// Node's File: jsdom's has no arrayBuffer(), which the duplicate check reads.
const png = (name: string, body = name) => new NodeFile([body], name, { type: "image/png" }) as unknown as File;

/** An upload the test lets land, or fail, when it chooses. */
function held() {
  let land!: (a: AssetView) => void;
  let fail!: (e: Error) => void;
  const promise = new Promise<AssetView>((res, rej) => ((land = res), (fail = rej)));
  return { promise, land, fail };
}

let created: string[];
let revoked: string[];

beforeEach(() => {
  created = [];
  revoked = [];
  let n = 0;
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:preview-${++n}`;
    created.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
  api.uploadPageAsset.mockReset();
  api.deleteAsset.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  const saved = draftFrom(empty);
  return renderHook(() => {
    const [draft, setDraft] = useState<AssetsDraft | null>(saved);
    const edit = useCallback((u: (d: AssetsDraft) => AssetsDraft) => setDraft((d) => (d ? u(d) : d)), []);
    return { draft, setDraft, saved, uploads: useAssetUploads(draft, edit) };
  });
}

const ids = (d: AssetsDraft | null) => d?.images.map((i) => i.asset.id) ?? [];

describe("useAssetUploads clean-up (#463)", () => {
  it("an upload that lands normally is shown and kept", async () => {
    const up = held();
    api.uploadPageAsset.mockReturnValue(up.promise);
    const { result } = setup();
    act(() => result.current.uploads.uploadProps("reference").onAddFiles([png("a.png")]));
    await waitFor(() => expect(ids(result.current.draft)).toHaveLength(1));
    await act(async () => up.land(asset("a1", "a.png")));
    await waitFor(() => expect(ids(result.current.draft)).toEqual(["a1"]));
    expect(api.deleteAsset).not.toHaveBeenCalled();
  });

  it("Cancel while it uploads: the preview goes at once, and the upload is deleted when it lands", async () => {
    const up = held();
    api.uploadPageAsset.mockReturnValue(up.promise);
    const { result } = setup();
    act(() => result.current.uploads.uploadProps("reference").onAddFiles([png("a.png")]));
    await waitFor(() => expect(ids(result.current.draft)).toHaveLength(1));
    act(() => {
      result.current.setDraft(result.current.saved);
      result.current.uploads.reset();
    });
    expect(revoked).toEqual(created);
    await act(async () => up.land(asset("a1", "a.png")));
    await waitFor(() => expect(api.deleteAsset).toHaveBeenCalledWith("a1"));
    expect(ids(result.current.draft)).toEqual([]);
  });

  it("Cancel after a failed upload releases its preview", async () => {
    api.uploadPageAsset.mockRejectedValue(new Error("nope"));
    const { result } = setup();
    act(() => result.current.uploads.uploadProps("reference").onAddFiles([png("a.png")]));
    await waitFor(() => expect(result.current.draft?.images[0]?.upload?.state).toBe("failed"));
    expect(revoked).toEqual([]);
    act(() => result.current.setDraft(result.current.saved));
    expect(revoked).toEqual(created);
  });

  it("removing a failed tile releases its own preview, and only its own", async () => {
    api.uploadPageAsset.mockRejectedValue(new Error("nope"));
    const { result } = setup();
    act(() => result.current.uploads.uploadProps("reference").onAddFiles([png("a.png"), png("b.png")]));
    await waitFor(() => expect(result.current.draft?.images.map((i) => i.upload?.state)).toEqual(["failed", "failed"]));
    const a = result.current.draft!.images.find((i) => i.asset.name === "a.png")!;
    act(() => result.current.setDraft((d) => d && removeImage(d, a.asset.id)));
    expect(revoked).toEqual([a.asset.url]);
  });

  it("the same file can be added again after its tile was removed", async () => {
    api.uploadPageAsset.mockRejectedValue(new Error("nope"));
    const { result } = setup();
    act(() => result.current.uploads.uploadProps("reference").onAddFiles([png("a.png")]));
    await waitFor(() => expect(ids(result.current.draft)).toHaveLength(1));
    act(() => result.current.setDraft(result.current.saved));
    act(() => result.current.uploads.uploadProps("reference").onAddFiles([png("a.png")]));
    await waitFor(() => expect(ids(result.current.draft)).toHaveLength(1));
    expect(result.current.uploads.uploadProps("reference").addError).toBeNull();
  });

  it("leaving the page releases every preview, and an upload landing after is deleted", async () => {
    const up = held();
    api.uploadPageAsset.mockReturnValue(up.promise);
    const { result, unmount } = setup();
    act(() => result.current.uploads.uploadProps("reference").onAddFiles([png("a.png")]));
    await waitFor(() => expect(ids(result.current.draft)).toHaveLength(1));
    unmount();
    expect(revoked).toEqual(created);
    await act(async () => up.land(asset("a1", "a.png")));
    await waitFor(() => expect(api.deleteAsset).toHaveBeenCalledWith("a1"));
  });
});
