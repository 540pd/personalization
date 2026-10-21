import { beforeEach, describe, expect, it, vi } from "vitest";

// The background upload into stored assets (#323), against a stubbed API.

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/api/canvas.api", () => ({ apiFetch }));

import { uploadNodeFile, retryNodeUpload } from "../uploadAsset";
import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodeUploads } from "@/store/nodeUploads.store";

const ASSET = "/api/proxy/assets/0b9f3c1e-2d4a-4b8e-9f6a-1c2d3e4f5a6b/content";
const file = () => new File([new Uint8Array([1, 2, 3])], "cat.png", { type: "image/png" });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  apiFetch.mockReset();
  useNodeUploads.setState({ uploads: {} });
  useKonvaNodes.setState({ nodes: { n1: { id: "n1", canvasX: 0, canvasY: 0, canvasW: 100, canvasH: 80, imageUrl: "data:image/png;base64,AA" } } });
});

describe("uploadNodeFile", () => {
  it("sends the file with its own type, and points the node at a durable asset", async () => {
    apiFetch.mockResolvedValue(json(201, { url: ASSET, durable: true }));
    await uploadNodeFile("n1", file());
    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toBe("assets");
    expect(init.headers).toEqual({ "Content-Type": "image/png" });
    expect(init.body).toBeInstanceOf(File);
    expect(useKonvaNodes.getState().nodes.n1.imageUrl).toBe(ASSET);
    expect(useNodeUploads.getState().uploads).toEqual({});
  });

  it("keeps the local copy when the asset is not durable", async () => {
    apiFetch.mockResolvedValue(json(201, { url: ASSET, durable: false }));
    await uploadNodeFile("n1", file());
    expect(useKonvaNodes.getState().nodes.n1.imageUrl).toBe("data:image/png;base64,AA");
    expect(useNodeUploads.getState().uploads).toEqual({});
  });

  it("says why it failed, and Retry sends the same file again", async () => {
    apiFetch.mockResolvedValueOnce(json(415, {})).mockResolvedValueOnce(json(201, { url: ASSET, durable: true }));
    const f = file();
    await uploadNodeFile("n1", f);
    expect(useNodeUploads.getState().uploads.n1).toEqual({ state: "failed", message: "This kind of file can't be saved" });
    retryNodeUpload("n1");
    await vi.waitFor(() => expect(useKonvaNodes.getState().nodes.n1.imageUrl).toBe(ASSET));
    expect(apiFetch.mock.calls[1][1].body).toBe(f);
  });

  it("a network failure is a failure too", async () => {
    apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await uploadNodeFile("n1", file());
    expect(useNodeUploads.getState().uploads.n1).toEqual({ state: "failed", message: "Couldn't save it to your account" });
  });

  it("a node deleted mid-upload is not brought back", async () => {
    let answer!: (r: Response) => void;
    apiFetch.mockReturnValue(new Promise<Response>((r) => (answer = r)));
    const done = uploadNodeFile("n1", file());
    useKonvaNodes.getState().remove("n1");
    answer(json(201, { url: ASSET, durable: true }));
    await done;
    expect(useKonvaNodes.getState().nodes.n1).toBeUndefined();
    expect(useNodeUploads.getState().uploads).toEqual({});
  });
});
