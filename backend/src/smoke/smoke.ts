// The smoke test (#336): one run against any backend that says, per
// service, whether it is real or a placeholder and whether it works. Meant
// for the moment someone sets the GCP variables (docs/switching-to-gcp.md).

export interface SmokeOptions {
  /** The backend's base URL, e.g. http://localhost:4000. */
  url: string;
  /** A signed-in session's gcos_session cookie value (Google mode). */
  cookie?: string;
  /** Dev sign-in's email (dev mode). */
  email?: string;
  /** Run a generation too: billed on Vertex AI, so opt-in. */
  generate?: boolean;
  /** Cloud Run's OIDC token, when the backend admits only authenticated
   * callers (`gcloud auth print-identity-token`). */
  infraToken?: string;
}

export type CheckResult = { name: string; status: "pass" | "fail" | "skip"; detail: string };

type Reply = { status: number; headers: Headers; body: Buffer };

/** 1×1 PNG: the smallest file the asset store takes. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

class Check extends Error {}
const fail = (detail: string): never => {
  throw new Check(detail);
};

/** Runs every check in order, reporting each as it settles. */
export async function runSmoke(opts: SmokeOptions, report: (r: CheckResult) => void = () => {}): Promise<CheckResult[]> {
  const base = opts.url.replace(/\/+$/, "");
  let cookie = opts.cookie ? `gcos_session=${opts.cookie.replace(/^gcos_session=/, "")}` : "";
  const results: CheckResult[] = [];

  async function call(method: string, path: string, body?: Buffer | object, type?: string): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (cookie) headers.Cookie = cookie;
    if (opts.infraToken) headers.Authorization = `Bearer ${opts.infraToken}`;
    let payload: Buffer | string | undefined;
    if (Buffer.isBuffer(body)) {
      payload = body;
      headers["Content-Type"] = type ?? "application/octet-stream";
    } else if (body) {
      payload = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }
    // Asset URLs are the browser's, through the frontend's proxy; here the
    // backend is called directly.
    const res = await fetch(`${base}${path.replace(/^\/api\/proxy\//, "/api/")}`, { method, headers, body: payload });
    return { status: res.status, headers: res.headers, body: Buffer.from(await res.arrayBuffer()) };
  }
  const json = (r: Reply) => JSON.parse(r.body.toString() || "null");

  async function check(name: string, run: () => Promise<string>, skip?: string) {
    let result: CheckResult;
    if (skip) result = { name, status: "skip", detail: skip };
    else {
      try {
        result = { name, status: "pass", detail: await run() };
      } catch (err) {
        result = { name, status: "fail", detail: err instanceof Check ? err.message : (err as Error).message };
      }
    }
    results.push(result);
    report(result);
    return result.status === "pass";
  }

  let mode = "";
  const reachable = await check("health", async () => {
    const r = await call("GET", "/api/health");
    const body = json(r);
    const m = body?.modes;
    const modes = m
      ? `sign-in=${m.auth} storage=${m.storage.firestore}/${m.storage.storage} ai=${m.ai}${m.jobs ? ` jobs=${m.jobs}` : ""}`
      : "no modes reported";
    if (r.status !== 200 || !body?.ok) fail(`${r.status}: ${body?.storage ?? body?.error ?? "not ok"} (${modes})`);
    return modes;
  });
  if (!reachable) return results;

  await check("sign-in mode", async () => {
    const r = await call("GET", "/api/auth-config");
    mode = json(r)?.mode ?? fail(`${r.status}: no mode`);
    return mode;
  });

  const needsSession = mode === "required" && !cookie;
  const signedIn = await check(
    "session",
    async () => {
      if (mode === "anonymous") return "anonymous: none needed";
      if (mode === "dev" && !cookie) {
        const email = opts.email ?? "dev.user@accenture.com";
        const r = await call("POST", "/api/session/dev-sign-in", { email });
        if (r.status !== 200) fail(`dev sign-in ${r.status}: ${json(r)?.error ?? ""}`);
        const set = r.headers.getSetCookie().find((c) => c.startsWith("gcos_session="));
        cookie = set?.split(";")[0] ?? fail("dev sign-in set no cookie");
      }
      const r = await call("GET", "/api/session");
      if (r.status !== 200) fail(`${r.status}: ${json(r)?.error ?? "no session"}`);
      return `signed in as ${json(r).email}`;
    },
    needsSession ? "needs --cookie: Google sign-in can't be scripted (see docs/switching-to-gcp.md)" : undefined,
  );
  const gated = signedIn ? undefined : "needs a session";

  await check(
    "assets",
    async () => {
      const up = await call("POST", "/api/assets", PNG, "image/png");
      if (up.status !== 201) fail(`upload ${up.status}: ${json(up)?.error ?? ""}`);
      const asset = json(up) as { id: string; url: string; durable: boolean };
      try {
        const down = await call("GET", asset.url);
        if (down.status !== 200) fail(`download ${down.status}`);
        if (!down.body.equals(PNG)) fail("downloaded bytes differ from the upload");
      } finally {
        await call("DELETE", `/api/assets/${asset.id}`);
      }
      return `upload, download (byte-identical), delete; durable=${asset.durable}`;
    },
    gated,
  );

  await check(
    "boards",
    async () => {
      const made = await call("POST", "/api/boards", { name: "smoke test" });
      if (made.status !== 201) fail(`create ${made.status}`);
      const board = json(made) as { id: string };
      try {
        const list = json(await call("GET", "/api/boards")) as { id: string }[];
        if (!list.some((b) => b.id === board.id)) fail("the new board is not listed");
      } finally {
        await call("DELETE", `/api/boards/${board.id}`);
      }
      const after = json(await call("GET", "/api/boards")) as { id: string }[];
      if (after.some((b) => b.id === board.id)) fail("the board is still listed after delete");
      return "create, list, delete";
    },
    gated,
  );

  await check(
    "generate",
    async () => {
      const r = await call("POST", "/api/generate/image", {
        modelId: "gemini-3.1-flash-image",
        instruction: "smoke test: a plain grey square",
        aspectRatio: "1:1",
      });
      if (r.status !== 200) fail(`${r.status}: ${json(r)?.message ?? ""}`);
      const { imageUrl, modelUsed } = json(r) as { imageUrl: string; modelUsed: string };
      if (imageUrl.startsWith("/api/proxy/assets/")) {
        const img = await call("GET", imageUrl);
        if (img.status !== 200) fail(`stored output ${img.status}`);
        const id = imageUrl.split("/")[4];
        await call("DELETE", `/api/assets/${id}`);
      }
      return `${modelUsed === "mock" ? "placeholder" : modelUsed}, ${imageUrl.startsWith("data:") ? "inline" : "stored as an asset"}`;
    },
    gated ?? (opts.generate ? undefined : "pass --generate (billed on Vertex AI)"),
  );

  return results;
}
