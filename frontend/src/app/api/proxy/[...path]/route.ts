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
  const targetPath = path.join("/");
  const targetUrl = `${BACKEND_URL}/api/${targetPath}`;

  const url = new URL(targetUrl);
  if (req.nextUrl.search) {
    url.search = req.nextUrl.search;
  }

  const forwardHeaders = new Headers();

  // Forward content-type and user identity headers
  const contentType = req.headers.get("content-type");
  if (contentType) forwardHeaders.set("content-type", contentType);

  const userCredential =
    req.headers.get("authorization") ??
    req.headers.get("cookie") ?? // session cookie forwarded for HttpOnly handling
    undefined;

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

  // Forward session cookie for HttpOnly session token
  const cookie = req.headers.get("cookie");
  if (cookie) forwardHeaders.set("cookie", cookie);

  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;

  const backendResponse = await fetch(url.toString(), {
    method: req.method,
    headers: forwardHeaders,
    body,
  });

  const responseHeaders = new Headers();
  const setCookie = backendResponse.headers.get("set-cookie");
  if (setCookie) responseHeaders.set("set-cookie", setCookie);

  const responseContentType = backendResponse.headers.get("content-type");
  if (responseContentType) responseHeaders.set("content-type", responseContentType);

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
