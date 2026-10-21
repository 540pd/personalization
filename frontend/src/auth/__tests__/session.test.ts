import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkSession, completeDevSignIn, completeSignIn, signOut } from "../session";
import { getIdToken, notifySessionExpired, setIdToken } from "../authState";
import { useIdentityStore, nameFromEmail } from "../useIdentity";
import { emailOfIdToken } from "../googleIdentity";

// The sign-in lifecycle (#321) against a stubbed /api/proxy.

const token = (email: string) => `h.${btoa(JSON.stringify({ email })).replace(/=+$/, "")}.s`;

type Reply = { status: number; body?: unknown } | "offline";
let replies: Record<string, Reply>;
const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  replies = {};
  setIdToken(null);
  useIdentityStore.setState({ status: "checking", mode: null, identity: null, expired: false, error: null });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    calls.push(key);
    const reply = replies[key] ?? { status: 404 };
    if (reply === "offline") throw new TypeError("Failed to fetch");
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const state = () => useIdentityStore.getState();
const AUTH = "GET /api/proxy/auth-config";
const SESSION = "GET /api/proxy/session";
const REFRESH = "POST /api/proxy/session/refresh";

describe("checkSession", () => {
  it("anonymous mode: the board, with the dev stand-in identity", async () => {
    replies[AUTH] = { status: 200, body: { mode: "anonymous" } };
    await checkSession();
    expect(state().status).toBe("anonymous");
    expect(state().identity?.email).toBeTruthy();
    expect(calls).toEqual([AUTH]);
  });

  it("required, with a session: signed in as the cookie's email", async () => {
    replies[AUTH] = { status: 200, body: { mode: "required" } };
    replies[SESSION] = { status: 200, body: { email: "ana.silva@accenture.com" } };
    await checkSession();
    expect(state()).toMatchObject({ status: "signedIn", identity: { name: "Ana Silva", email: "ana.silva@accenture.com" } });
  });

  it("required, no session: signed out", async () => {
    replies[AUTH] = { status: 200, body: { mode: "required" } };
    replies[SESSION] = { status: 401, body: { error: "token_missing" } };
    await checkSession();
    expect(state()).toMatchObject({ status: "signedOut", identity: null });
  });

  it("required, session check failing: unreachable, not signed out", async () => {
    replies[AUTH] = { status: 200, body: { mode: "required" } };
    replies[SESSION] = { status: 502 };
    await checkSession();
    expect(state().status).toBe("unreachable");
  });

  it("no backend: a dev build still opens the board; a production build says so", async () => {
    replies[AUTH] = "offline";
    await checkSession();
    expect(state().status).toBe("anonymous");

    vi.stubEnv("NODE_ENV", "production");
    await checkSession();
    expect(state().status).toBe("unreachable");
  });
});

describe("completeSignIn", () => {
  beforeEach(() => useIdentityStore.setState({ status: "signedOut" }));

  it("exchanges the token for the cookie, then drops the token", async () => {
    replies[REFRESH] = { status: 200, body: { ok: true } };
    replies[SESSION] = { status: 200, body: { email: "ana.silva@accenture.com" } };
    await completeSignIn(token("ana.silva@accenture.com"));
    expect(state()).toMatchObject({ status: "signedIn", identity: { email: "ana.silva@accenture.com" }, error: null });
    expect(getIdToken()).toBeNull();
  });

  it("keeps the token when the backend issues no session cookie", async () => {
    replies[REFRESH] = { status: 200, body: { ok: true, note: "session tokens not configured" } };
    const t = token("ana.silva@accenture.com");
    await completeSignIn(t);
    expect(state().status).toBe("signedIn");
    expect(getIdToken()).toBe(t);
  });

  it("names a refused account, and stays signed out", async () => {
    replies[REFRESH] = { status: 401, body: { error: "domain_not_allowed" } };
    await completeSignIn(token("ana@gmail.com"));
    expect(state().status).toBe("signedOut");
    expect(state().error).toBe("ana@gmail.com isn't allowed here. Sign in with your work Google account.");
    expect(getIdToken()).toBeNull();
  });

  it("from the expired banner: signed in again, the banner gone", async () => {
    useIdentityStore.setState({ status: "signedIn", expired: true });
    replies[REFRESH] = { status: 200, body: { ok: true } };
    replies[SESSION] = { status: 200, body: { email: "ana.silva@accenture.com" } };
    await completeSignIn(token("ana.silva@accenture.com"));
    expect(state()).toMatchObject({ status: "signedIn", expired: false });
  });
});

describe("dev sign-in (#334)", () => {
  const DEV = "POST /api/proxy/session/dev-sign-in";

  it("checkSession remembers the mode, and asks for the session as in production", async () => {
    replies[AUTH] = { status: 200, body: { mode: "dev" } };
    replies[SESSION] = { status: 401, body: { error: "token_missing" } };
    await checkSession();
    expect(state()).toMatchObject({ status: "signedOut", mode: "dev" });
  });

  it("signs in as the email typed", async () => {
    useIdentityStore.setState({ status: "signedOut", mode: "dev" });
    replies[DEV] = { status: 200, body: { ok: true } };
    replies[SESSION] = { status: 200, body: { email: "dev.user@accenture.com" } };
    await completeDevSignIn("dev.user@accenture.com");
    expect(state()).toMatchObject({ status: "signedIn", identity: { name: "Dev User", email: "dev.user@accenture.com" } });
  });

  it("names a refused account, and says when it is not an email", async () => {
    useIdentityStore.setState({ status: "signedOut", mode: "dev" });
    replies[DEV] = { status: 401, body: { error: "domain_not_allowed" } };
    await completeDevSignIn(" Ana@Gmail.com ");
    expect(state().error).toBe("ana@gmail.com isn't allowed here. Sign in with your work Google account.");

    replies[DEV] = { status: 400, body: { error: "validation_error" } };
    await completeDevSignIn("ana");
    expect(state()).toMatchObject({ status: "signedOut", error: "Enter an email address." });
  });
});

describe("signOut and expiry", () => {
  it("signs out to the sign-in screen and clears the cookie", async () => {
    useIdentityStore.setState({ status: "signedIn", identity: { name: "A", email: "a@accenture.com" } });
    setIdToken("t");
    replies["POST /api/proxy/session/sign-out"] = { status: 204 };
    await signOut();
    expect(state()).toMatchObject({ status: "signedOut", identity: null });
    expect(getIdToken()).toBeNull();
    expect(calls).toContain("POST /api/proxy/session/sign-out");
  });

  it("in anonymous mode only drops the stand-in identity", async () => {
    useIdentityStore.setState({ status: "anonymous", identity: { name: "A", email: "a@accenture.com" } });
    await signOut();
    expect(state()).toMatchObject({ status: "anonymous", identity: null });
    expect(calls).toEqual([]);
  });

  it("an expired session raises the banner only while signed in", () => {
    useIdentityStore.setState({ status: "anonymous" });
    notifySessionExpired();
    expect(state().expired).toBe(false);
    useIdentityStore.setState({ status: "signedIn" });
    notifySessionExpired();
    expect(state().expired).toBe(true);
  });
});

describe("helpers", () => {
  it("names a person from a work address", () => {
    expect(nameFromEmail("ana.maria.silva@accenture.com")).toBe("Ana Maria Silva");
    expect(nameFromEmail("j_doe-2@accenture.com")).toBe("J Doe 2");
  });

  it("reads the email from a token's payload, and survives garbage", () => {
    expect(emailOfIdToken(token("ana@gmail.com"))).toBe("ana@gmail.com");
    expect(emailOfIdToken("not-a-jwt")).toBeNull();
  });
});
