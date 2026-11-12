import { GoogleAuth } from "google-auth-library";
import { type NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

// In production (K_SERVICE is set by Cloud Run), the frontend mints a
// service-to-service OIDC token for the backend's IAM invoker check and
// places it in Authorization. The user's real identity credential is moved
// to X-User-Identity to avoid collision on the same header.
// In local dev (no K_SERVICE), headers are forwarded as-is.
const IS_PRODUCTION = !!process.env.K_SERVICE;
const auth = new GoogleAuth();

// How long the proxy waits for the backend to answer. Set by the slowest
// synchronous route, POST /generate/image: up to 10 variants of a 4K image,
// each a full model call, all in the one request. Video does not count --
// its start route answers 202 at once and the client polls. Five minutes is
// Cloud Run's default request timeout, so the proxy never gives up on a
// request the backend would still have finished. Not exported: Next allows
// only route handlers and config as exports of a route file.
const BACKEND_TIMEOUT_MS = 5 * 60 * 1000;

// The backend's HttpOnly session cookie (backend lib/sessionCookie.ts). It is
// the only cookie forwarded: the backend needs no other, and the rest of this
// origin's cookies are none of its business.
const SESSION_COOKIE = "gcos_session";

/** Backend response headers the browser gets as they are; the rest stay put. */
const PASSED_THROUGH = ["content-type", "content-length", "cache-control", "etag", "x-content-type-options"];

type ErrorBody = { error: string; message: string };

/** `name=value` for the session cookie in a Cookie header, or null. */
function sessionCookie(header: string | null): string | null {
  for (const part of header?.split(";") ?? []) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE && value.length) return `${SESSION_COOKIE}=${value.join("=")}`;
  }
  return null;
}

function errorResponse(status: number, body: ErrorBody): NextResponse {
  return NextResponse.json(body, { status });
}

/**
 * True when a catch-all segment would step outside /api/ on the backend.
 *
 * Next decodes each segment once, so `%2f` arrives here as a `/` inside a
 * segment and `%2e%2e` as `..`. Checked once more after a second decode too:
 * a segment that still reads `%2e%2e` is itself a `..` to the URL parser.
 */
function isUnsafeSegment(segment: string): boolean {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // A stray `%` that is not an escape: nothing further to decode, and it is
    // re-encoded as %25 below.
  }
  return [segment, decoded].some(
    (s) => s === "" || s === "." || s === ".." || s.includes("/") || s.includes("\\")
  );
}

async function getInfraToken(targetUrl: string): Promise<string | null> {
  // TODO: mint a Cloud Run OIDC token for service-to-service auth.
  // The target audience is the backend Cloud Run service URL.
  // See: https://cloud.google.com/run/docs/authenticating/service-to-service
  try {
    const client = await auth.getIdTokenClient(targetUrl);
    const headers = await client.getRequestHeaders();
    return headers["Authorization"]?.replace("Bearer ", "") ?? null;
  } catch {
    return null;
  }
}

async function handler(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!path?.length || path.some(isUnsafeSegment)) {
    return errorResponse(400, { error: "invalid_path", message: "Invalid API path." });
  }
  // Re-encoded, since Next handed them over decoded: a segment carrying a
  // `?`, `#` or `%` must stay one path segment on the backend too.
  const targetPath = path.map(encodeURIComponent).join("/");
  const targetUrl = `${BACKEND_URL}/api/${targetPath}`;

  const url = new URL(targetUrl);
  if (req.nextUrl.search) {
    url.search = req.nextUrl.search;
  }

  const forwardHeaders = new Headers();

  // Forward content-type and user identity headers
  const contentType = req.headers.get("content-type");
  if (contentType) forwardHeaders.set("content-type", contentType);

  // The user's bearer token, when the page holds one. The session cookie is
  // not a credential header: it travels as a cookie, below.
  const userCredential = req.headers.get("authorization");

  if (IS_PRODUCTION) {
    // Deployed: put infra OIDC token in Authorization, user credential in X-User-Identity
    const infraToken = await getInfraToken(BACKEND_URL);
    if (infraToken) {
      forwardHeaders.set("Authorization", `Bearer ${infraToken}`);
    }
    if (userCredential) {
      forwardHeaders.set("X-User-Identity", userCredential);
    }
  } else {
    // Local dev: forward the user's Authorization header directly
    if (userCredential) {
      forwardHeaders.set("Authorization", userCredential);
    }
  }

  // The browser's address, for the support form's limit per address (#428):
  // otherwise the backend sees only this proxy's. The last X-Forwarded-For
  // entry is the one Cloud Run's front end adds; earlier ones the browser
  // can write itself.
  const clientIp = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  if (clientIp) forwardHeaders.set("X-Client-IP", clientIp);

  const cookie = sessionCookie(req.headers.get("cookie"));
  if (cookie) forwardHeaders.set("cookie", cookie);

  // The browser's Origin, as it sent it: the backend refuses a cookie-
  // authenticated change from any origin not in its ALLOWED_ORIGINS (CSRF,
  // #490). Only Origin: never Referer or X-Forwarded-Host in its place.
  const origin = req.headers.get("origin");
  if (origin) forwardHeaders.set("origin", origin);

  // Bytes, not text: req.text() decodes as UTF-8, which corrupts a binary
  // upload. Buffered rather than streamed, so fetch needs no duplex: "half";
  // the backend caps JSON bodies at 10 MB anyway.
  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined;

  let backendResponse: Response;
  try {
    backendResponse = await fetch(url.toString(), {
      method: req.method,
      headers: forwardHeaders,
      body,
      // The browser's abort as well as the timeout: a closed tab or a
      // deleted node stops holding a proxy connection and a backend request
      // slot for up to BACKEND_TIMEOUT_MS. It does not stop a model call
      // already made -- @google/genai cannot cancel one in the service, and
      // it is billed either way -- so the backend is not wired to it.
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(BACKEND_TIMEOUT_MS)]),
    });
  } catch (err) {
    // The browser gave up: no one is waiting for an answer, and nothing
    // went wrong. 499 is the usual "client closed the request".
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    // A JSON answer the client can read, rather than Next's own 500 page.
    if ((err as { name?: unknown } | null)?.name === "TimeoutError") {
      return errorResponse(504, {
        error: "backend_timeout",
        message: `The backend did not answer within ${BACKEND_TIMEOUT_MS / 1000} seconds.`,
      });
    }
    console.error(`[proxy] ${req.method} /api/${targetPath} failed`, err);
    return errorResponse(502, {
      error: "backend_unavailable",
      message: "The backend could not be reached.",
    });
  }

  const responseHeaders = new Headers();
  // Each Set-Cookie on its own: get() would join several with commas, which
  // a cookie's Expires date also contains.
  for (const setCookie of backendResponse.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", setCookie);
  }

  // The headers a stored file is served with (#323): its type and size,
  // and that the browser may keep it for good.
  for (const name of PASSED_THROUGH) {
    const value = backendResponse.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
