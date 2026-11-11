import { GoogleAuth } from "google-auth-library";

// The two seams the client sits on (#494): where its service token comes from,
// and how bytes travel. Tests pass fakes of both.

/** Mints the Google-signed service ID token for one audience. */
export interface ServiceTokenProvider {
  /** The bare token (no "Bearer "). Throws when it can't be minted. */
  token(): Promise<string>;
}

/**
 * The backend's own identity, via Application Default Credentials: on Cloud
 * Run, the service account; locally, `gcloud auth application-default login`.
 * Never a user's token. google-auth-library caches and refreshes the token.
 */
export function googleServiceTokens(audience: string, auth: GoogleAuth = new GoogleAuth()): ServiceTokenProvider {
  let client: ReturnType<GoogleAuth["getIdTokenClient"]> | null = null;
  return {
    async token() {
      client ??= auth.getIdTokenClient(audience);
      try {
        const headers = await (await client).getRequestHeaders();
        const value = (headers as Record<string, string>)["Authorization"] ?? (headers as Record<string, string>)["authorization"];
        if (!value?.startsWith("Bearer ")) throw new Error("no token");
        return value.slice("Bearer ".length);
      } catch (err) {
        client = null; // a failed client is not reused: the next call tries afresh
        throw err;
      }
    },
  };
}

export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxResponseBytes: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Why a request got no answer. */
export class TransportError extends Error {
  constructor(readonly kind: "timeout" | "network" | "too_large") {
    super(`transport ${kind}`);
    this.name = "TransportError";
  }
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

/**
 * fetch, bounded: the timeout covers connecting and the whole answer, and an
 * answer over the size limit is cut off rather than read into memory.
 */
export const fetchTransport: HttpTransport = async (request) => {
  const signal = AbortSignal.timeout(request.timeoutMs);
  let res: Response;
  try {
    res = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body, signal, redirect: "error" });
  } catch (err) {
    throw new TransportError(isTimeout(err) ? "timeout" : "network");
  }
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > request.maxResponseBytes) {
    await res.body?.cancel();
    throw new TransportError("too_large");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    const reader = res.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > request.maxResponseBytes) {
        await reader.cancel();
        throw new TransportError("too_large");
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof TransportError) throw err;
    throw new TransportError(isTimeout(err) ? "timeout" : "network");
  }
  const headers: Record<string, string> = {};
  res.headers.forEach((value, name) => {
    headers[name] = value;
  });
  return { status: res.status, headers, body: Buffer.concat(chunks).toString("utf-8") };
};

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === "TimeoutError" || name === "AbortError";
}
