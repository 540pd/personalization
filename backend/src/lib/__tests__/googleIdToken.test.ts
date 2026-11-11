import { describe, expect, it } from "vitest";
import {
  googleIdTokenConfig,
  verifyGoogleIdToken,
  type GoogleIdTokenConfig,
  type IdTokenClient,
} from "../googleIdToken.js";

// The Google ID token verifier (#487, PACK NJS-01). Signature, audience and
// the library's own expiry check are google-auth-library's; a fake client
// stands in for it, and everything after it is ours.

const NOW = 1_800_000_000_000; // ms
const now = () => NOW;
const SEC = NOW / 1000;

const config: GoogleIdTokenConfig = {
  audiences: ["client-id"],
  issuers: ["accounts.google.com", "https://accounts.google.com"],
  hostedDomains: ["accenture.com"],
  emailDomains: ["accenture.com"],
  clockSkewSeconds: 300,
};

/** The claims of a valid Workspace token; override any of them. */
const claims = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  iss: "https://accounts.google.com",
  sub: "1234567890",
  aud: "client-id",
  exp: SEC + 3600,
  email: "ana@accenture.com",
  email_verified: true,
  hd: "accenture.com",
  ...over,
});

/** A client that returns `payload`, or throws `error` as the library would. */
function client(payload: Record<string, unknown> | undefined, error?: string): IdTokenClient & { audience?: unknown } {
  const fake = {
    audience: undefined as unknown,
    async verifyIdToken(options: { idToken: string; audience: string | string[] }) {
      fake.audience = options.audience;
      if (error) throw new Error(error);
      return { getPayload: () => payload };
    },
  };
  return fake;
}

const verify = (c: IdTokenClient, cfg = config) => verifyGoogleIdToken("a.b.c", cfg, c, now);

describe("verifyGoogleIdToken", () => {
  it("returns issuer, subject, email and hosted domain for a valid Workspace token", async () => {
    const result = await verify(client(claims()));
    expect(result).toEqual({
      ok: true,
      identity: {
        issuer: "https://accounts.google.com",
        subject: "1234567890",
        email: "ana@accenture.com",
        hostedDomain: "accenture.com",
      },
    });
  });

  it("returns only those four fields, never the rest of the claims", async () => {
    const result = await verify(client(claims({ name: "Ana", picture: "https://x/p.png", nonce: "n" })));
    expect(result.ok && Object.keys(result.identity).sort()).toEqual(["email", "hostedDomain", "issuer", "subject"]);
  });

  it("asks the library to check the configured audiences", async () => {
    const fake = client(claims());
    await verify(fake, { ...config, audiences: ["client-id", "other-client"] });
    expect(fake.audience).toEqual(["client-id", "other-client"]);
  });

  describe("refuses what the library rejects, without passing its message on", () => {
    it.each([
      ["wrong audience", "Wrong recipient, payload audience != requiredAudience", "token_invalid"],
      ["bad signature", "Invalid token signature: a.b.c", "token_invalid"],
      ["malformed token", "Wrong number of segments in token: a.b", "token_invalid"],
      ["key fetch failure", "Failed to retrieve verification certificates: ECONNRESET", "token_invalid"],
      ["expired", "Token used too late, 1799990000 > 1799999000", "token_expired"],
    ])("%s", async (_label, message, code) => {
      const result = await verify(client(undefined, message));
      expect(result).toMatchObject({ ok: false, code });
      expect(JSON.stringify(result)).not.toContain(message);
      expect(JSON.stringify(result)).not.toContain("a.b.c");
    });
  });

  it.each([
    ["an issuer that isn't Google", { iss: "https://evil.example.com" }, "token_invalid"],
    ["no subject", { sub: "" }, "token_invalid"],
    ["a non-string subject", { sub: 42 }, "token_invalid"],
    ["no email", { email: undefined }, "token_invalid"],
    ["an unverified email", { email_verified: false }, "token_invalid"],
    ["email_verified as a string", { email_verified: "true" }, "token_invalid"],
    ["no hd (a personal account)", { hd: undefined, email: "ana@gmail.com" }, "domain_not_allowed"],
    ["no hd, even with an allowed email", { hd: undefined }, "domain_not_allowed"],
    ["an hd not on the allowlist", { hd: "other.com" }, "domain_not_allowed"],
    ["an allowed hd but an email domain that isn't", { email: "ana@other.com" }, "domain_not_allowed"],
    ["no exp", { exp: undefined }, "token_invalid"],
  ])("refuses %s", async (_label, over, code) => {
    expect(await verify(client(claims(over)))).toMatchObject({ ok: false, code });
  });

  it("refuses an empty payload", async () => {
    expect(await verify(client(undefined))).toMatchObject({ ok: false, code: "token_invalid" });
  });

  it("matches hd and the email domain without regard to case", async () => {
    const result = await verify(client(claims({ hd: "Accenture.COM", email: "Ana@Accenture.com" })));
    expect(result).toMatchObject({ ok: true, identity: { hostedDomain: "accenture.com", email: "Ana@Accenture.com" } });
  });

  it("applies a clock skew stricter than the library's", async () => {
    const expired = claims({ exp: SEC - 60 });
    expect(await verify(client(expired))).toMatchObject({ ok: true });
    expect(await verify(client(expired), { ...config, clockSkewSeconds: 30 })).toMatchObject({
      ok: false,
      code: "token_expired",
    });
  });

  it("fails closed when nothing is configured", async () => {
    expect(await verify(client(claims()), { ...config, audiences: [] })).toMatchObject({ ok: false, code: "token_invalid" });
    expect(await verify(client(claims()), { ...config, hostedDomains: [] })).toMatchObject({
      ok: false,
      code: "domain_not_allowed",
    });
    expect(await verify(client(claims()), { ...config, emailDomains: [] })).toMatchObject({
      ok: false,
      code: "domain_not_allowed",
    });
  });
});

describe("googleIdTokenConfig", () => {
  it("defaults the hosted domains to ALLOWED_EMAIL_DOMAINS", () => {
    const cfg = googleIdTokenConfig({ GOOGLE_OAUTH_CLIENT_ID: "client-id", ALLOWED_EMAIL_DOMAINS: "accenture.com, Example.org" });
    expect(cfg.hostedDomains).toEqual(["accenture.com", "example.org"]);
    expect(cfg.emailDomains).toEqual(["accenture.com", "example.org"]);
  });

  it("falls back to accenture.com when neither list is set", () => {
    expect(googleIdTokenConfig({}).hostedDomains).toEqual(["accenture.com"]);
  });

  it("reads ALLOWED_HOSTED_DOMAINS when set, even to nothing", () => {
    expect(googleIdTokenConfig({ ALLOWED_HOSTED_DOMAINS: "corp.example.com" }).hostedDomains).toEqual(["corp.example.com"]);
    expect(googleIdTokenConfig({ ALLOWED_HOSTED_DOMAINS: "" }).hostedDomains).toEqual([]);
  });

  it("reads one or more audiences from GOOGLE_OAUTH_CLIENT_ID", () => {
    expect(googleIdTokenConfig({ GOOGLE_OAUTH_CLIENT_ID: "a, b" }).audiences).toEqual(["a", "b"]);
    expect(googleIdTokenConfig({}).audiences).toEqual([]);
  });

  it("uses Google's two issuer forms", () => {
    expect(googleIdTokenConfig({}).issuers).toEqual(["accounts.google.com", "https://accounts.google.com"]);
  });

  it("defaults the clock skew to 300 s and accepts 0–300", () => {
    expect(googleIdTokenConfig({}).clockSkewSeconds).toBe(300);
    expect(googleIdTokenConfig({ GOOGLE_ID_TOKEN_CLOCK_SKEW_SECONDS: "0" }).clockSkewSeconds).toBe(0);
    expect(googleIdTokenConfig({ GOOGLE_ID_TOKEN_CLOCK_SKEW_SECONDS: "60" }).clockSkewSeconds).toBe(60);
  });

  it.each(["-1", "301", "1.5", "soon"])("refuses a clock skew of %s", (value) => {
    expect(() => googleIdTokenConfig({ GOOGLE_ID_TOKEN_CLOCK_SKEW_SECONDS: value })).toThrow(/CLOCK_SKEW/);
  });
});
