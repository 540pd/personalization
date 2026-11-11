// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Never reached outside production (no K_SERVICE), but stubbed so importing
// the route cannot go looking for Google credentials.
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    getIdTokenClient() {
      return Promise.reject(new Error("not in tests"));
    }
  },
}));

import { GET, POST } from "../route";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** What Next passes a catch-all handler: the segments, already decoded once. */
const params = (...path: string[]) => ({ params: Promise.resolve({ path }) });

const backendJson = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

describe("proxy route", () => {
  it("forwards to /api/<path> on the backend, keeping the query string", async () => {
    fetchMock.mockResolvedValue(backendJson({ ok: true }));
    const res = await GET(
      new NextRequest("http://localhost:3000/api/proxy/generate/job/abc?since=1&x=a%20b"),
      params("generate", "job", "abc")
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:4000/api/generate/job/abc?since=1&x=a%20b");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("passes the backend's status, content-type and set-cookie through", async () => {
    fetchMock.mockResolvedValue(
      backendJson({ jobId: "j" }, { status: 202, headers: { "content-type": "application/json", "set-cookie": "s=1" } })
    );
    const res = await POST(
      new NextRequest("http://localhost:3000/api/proxy/generate/video", { method: "POST", body: "{}" }),
      params("generate", "video")
    );
    expect(res.status).toBe(202);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("set-cookie")).toBe("s=1");
  });

  it("forwards a binary body byte for byte", async () => {
    fetchMock.mockResolvedValue(backendJson({}));
    // Not valid UTF-8: req.text() would have turned these into U+FFFD.
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x80, 0xc3]);
    await POST(
      new NextRequest("http://localhost:3000/api/proxy/assets", {
        method: "POST",
        body: bytes,
        headers: { "content-type": "application/octet-stream" },
      }),
      params("assets")
    );

    const init = fetchMock.mock.calls[0][1]!;
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(bytes);
    expect(new Headers(init.headers).get("content-type")).toBe("application/octet-stream");
  });

  it("answers 502 JSON when the backend cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const res = await GET(new NextRequest("http://localhost:3000/api/proxy/boards"), params("boards"));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "backend_unavailable",
      message: "The backend could not be reached.",
    });
  });

  it("answers 504 JSON when the backend does not answer in time", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const res = await POST(
      new NextRequest("http://localhost:3000/api/proxy/generate/image", { method: "POST", body: "{}" }),
      params("generate", "image")
    );

    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toBe("backend_timeout");
    expect(body.message).toMatch(/300 seconds/);
  });

  it("stops waiting when the browser aborts, quietly", async () => {
    const browser = new AbortController();
    fetchMock.mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      }),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = POST(
      new NextRequest("http://localhost:3000/api/proxy/generate/image", {
        method: "POST", body: "{}", signal: browser.signal,
      }),
      params("generate", "image"),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    browser.abort();
    const res = await pending;
    expect(res.status).toBe(499);
    expect(error).not.toHaveBeenCalled();
  });

  it("times out on its own signal, after five minutes", async () => {
    // AbortSignal.timeout runs on Node's own timers, which fake timers do not
    // reach, so stand in a signal that has already timed out.
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => AbortSignal.abort(new DOMException("timed out", "TimeoutError")));
    fetchMock.mockImplementation((_url, init) => Promise.reject(init?.signal?.reason));

    const res = await GET(new NextRequest("http://localhost:3000/api/proxy/boards"), params("boards"));
    expect(timeout).toHaveBeenCalledWith(5 * 60 * 1000);
    expect(res.status).toBe(504);
  });

  it.each([
    ["..", ["..", "health"]],
    [".", ["boards", ".", "x"]],
    ["an empty segment", ["boards", "", "x"]],
    ["%2e%2e, decoded by Next", ["..", "..", "admin"]],
    ["%2f, decoded by Next", ["boards", "../../admin"]],
    ["a backslash", ["boards", "..\\admin"]],
    ["a double-encoded %2e%2e", ["%2e%2e", "admin"]],
    ["a double-encoded %2F", ["boards%2Fx"]],
    ["a double-encoded %5c", ["boards%5cx"]],
  ])("refuses %s with a 400, without calling the backend", async (_label, path) => {
    const res = await GET(new NextRequest("http://localhost:3000/api/proxy/x"), params(...path));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_path");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a segment with reserved characters as one segment", async () => {
    fetchMock.mockResolvedValue(backendJson({}));
    await GET(new NextRequest("http://localhost:3000/api/proxy/x"), params("boards", "a?b#c 50%"));
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/boards/a%3Fb%23c%2050%25");
  });
});

// The session cookie travels as a cookie and only it (#320): never as a
// credential header, and the page's other cookies stay on this origin.
describe("proxy route: credentials", () => {
  const sent = () => new Headers(fetchMock.mock.calls[0][1]?.headers);
  const get = (headers: Record<string, string>) =>
    GET(new NextRequest("http://localhost:3000/api/proxy/boards", { headers }), params("boards"));

  it("forwards only the session cookie, and no credential header for it", async () => {
    fetchMock.mockResolvedValue(backendJson({}));
    await get({ cookie: "theme=dark; gcos_session=a.b=c; _ga=1" });
    expect(sent().get("cookie")).toBe("gcos_session=a.b=c");
    expect(sent().get("authorization")).toBeNull();
    expect(sent().get("x-user-identity")).toBeNull();
  });

  it("passes the browser's address on as X-Client-IP: the last X-Forwarded-For entry", async () => {
    fetchMock.mockResolvedValue(backendJson({}));
    await get({ "x-forwarded-for": "10.0.0.1, 203.0.113.7" });
    expect(sent().get("x-client-ip")).toBe("203.0.113.7");
    await get({});
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("x-client-ip")).toBeNull();
  });

  it("forwards the browser's Origin, so the backend can check it (#490)", async () => {
    fetchMock.mockResolvedValue(backendJson({}));
    await POST(
      new NextRequest("http://localhost:3000/api/proxy/boards", {
        method: "POST",
        headers: { origin: "http://localhost:3000", cookie: "gcos_session=s", referer: "https://evil.example.com/" },
        body: "{}",
      }),
      params("boards")
    );
    expect(sent().get("origin")).toBe("http://localhost:3000");
    expect(sent().get("referer")).toBeNull();
    expect(sent().get("x-forwarded-host")).toBeNull();
  });

  it("forwards no Origin when the browser sent none", async () => {
    fetchMock.mockResolvedValue(backendJson({}));
    await get({ cookie: "gcos_session=s" });
    expect(sent().get("origin")).toBeNull();
  });

  it("forwards no cookie when there is no session cookie", async () => {
    fetchMock.mockResolvedValue(backendJson({}));
    await get({ cookie: "theme=dark" });
    expect(sent().get("cookie")).toBeNull();
  });

  it("locally, forwards the page's bearer token as Authorization", async () => {
    fetchMock.mockResolvedValue(backendJson({}));
    await get({ authorization: "Bearer id-token", cookie: "gcos_session=s" });
    expect(sent().get("authorization")).toBe("Bearer id-token");
    expect(sent().get("cookie")).toBe("gcos_session=s");
  });

  it("deployed, moves the bearer token to X-User-Identity, never the cookie", async () => {
    vi.resetModules();
    vi.stubEnv("K_SERVICE", "gcos-frontend");
    try {
      const deployed = await import("../route");
      fetchMock.mockResolvedValue(backendJson({}));
      await deployed.GET(
        new NextRequest("http://localhost:3000/api/proxy/boards", { headers: { cookie: "gcos_session=s" } }),
        params("boards"),
      );
      expect(sent().get("x-user-identity")).toBeNull();
      expect(sent().get("cookie")).toBe("gcos_session=s");

      fetchMock.mockClear();
      await deployed.GET(
        new NextRequest("http://localhost:3000/api/proxy/boards", { headers: { authorization: "Bearer id-token" } }),
        params("boards"),
      );
      expect(sent().get("x-user-identity")).toBe("Bearer id-token");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("passes several Set-Cookie headers through unjoined", async () => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("set-cookie", "gcos_session=new; Expires=Thu, 01 Jan 2026 00:00:00 GMT; HttpOnly");
    headers.append("set-cookie", "other=1");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200, headers }));
    const res = await get({});
    expect(res.headers.getSetCookie()).toEqual([
      "gcos_session=new; Expires=Thu, 01 Jan 2026 00:00:00 GMT; HttpOnly",
      "other=1",
    ]);
  });
});

describe("proxy route: stored files (#323)", () => {
  it("passes a file's type, size and caching through, and nothing else", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": "3",
          "cache-control": "private, max-age=31536000, immutable",
          etag: '"abc"',
          "x-content-type-options": "nosniff",
          "x-powered-by": "Express",
        },
      }),
    );
    const res = await GET(new NextRequest("http://localhost:3000/api/proxy/assets/abc/content"), params("assets", "abc", "content"));
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-length")).toBe("3");
    expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(res.headers.get("etag")).toBe('"abc"');
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
