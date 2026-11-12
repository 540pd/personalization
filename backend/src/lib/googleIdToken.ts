import { OAuth2Client } from "google-auth-library";

// Verifies a Google Sign-In ID token (#487, PACK NJS-01; docs/aryash rule 1):
// signature, audience, issuer and expiry, then a verified email and a Workspace
// domain (`hd`) on the allowlist. The email's suffix never stands in for `hd`.
// The one entry point is verifyGoogleIdToken; its result feeds sign-in.

/** Who a verified token says the user is. Nothing else from the claims. */
export interface VerifiedGoogleIdentity {
  /** `iss`: the Google issuer that signed the token. */
  issuer: string;
  /** `sub`: Google's stable ID for the account; with `issuer`, the identity. */
  subject: string;
  /** Verified (`email_verified`), as Google sends it: data is still keyed by it until owner keys (#488). */
  email: string;
  /** `hd`: the Workspace domain, lowercased; on the allowlist. */
  hostedDomain: string;
}

export type GoogleIdTokenRefusal = "token_invalid" | "token_expired" | "domain_not_allowed";

export type GoogleIdTokenResult =
  | { ok: true; identity: VerifiedGoogleIdentity }
  | { ok: false; code: GoogleIdTokenRefusal; reason: string };

export interface GoogleIdTokenConfig {
  /** OAuth client IDs a token may be issued to (`aud`). */
  audiences: string[];
  /** Accepted `iss` values. */
  issuers: string[];
  /** Workspace domains (`hd`) allowed to sign in. Empty refuses everyone. */
  hostedDomains: string[];
  /** Email domains also allowed; an extra check after `hd`, never instead. */
  emailDomains: string[];
  /** Slack on `exp`, at most the library's own 300 s. */
  clockSkewSeconds: number;
}

/** Google signs ID tokens with either form of its issuer. */
export const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

/** google-auth-library already allows this much on `exp`; ours can only be stricter. */
export const MAX_CLOCK_SKEW_SECONDS = 300;

const list = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

/**
 * The verifier's config, from the environment. Throws on a value that can't
 * be used, so a bad setting stops startup instead of weakening the check.
 * `ALLOWED_HOSTED_DOMAINS` defaults to `ALLOWED_EMAIL_DOMAINS` (placeholder
 * until the real Workspace domains are agreed, #487).
 */
export function googleIdTokenConfig(env: NodeJS.ProcessEnv = process.env): GoogleIdTokenConfig {
  const audiences = (env.GOOGLE_OAUTH_CLIENT_ID ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const emailDomains = list(env.ALLOWED_EMAIL_DOMAINS ?? "accenture.com");
  const hostedDomains = env.ALLOWED_HOSTED_DOMAINS === undefined ? emailDomains : list(env.ALLOWED_HOSTED_DOMAINS);

  const skewText = env.GOOGLE_ID_TOKEN_CLOCK_SKEW_SECONDS?.trim();
  const clockSkewSeconds = skewText ? Number(skewText) : MAX_CLOCK_SKEW_SECONDS;
  if (!Number.isInteger(clockSkewSeconds) || clockSkewSeconds < 0 || clockSkewSeconds > MAX_CLOCK_SKEW_SECONDS) {
    throw new Error(
      `GOOGLE_ID_TOKEN_CLOCK_SKEW_SECONDS must be a whole number from 0 to ${MAX_CLOCK_SKEW_SECONDS}, got "${skewText}".`
    );
  }
  return { audiences, issuers: GOOGLE_ISSUERS, hostedDomains, emailDomains, clockSkewSeconds };
}

/** The part of OAuth2Client this needs; tests pass their own. */
export interface IdTokenClient {
  verifyIdToken(options: { idToken: string; audience: string | string[] }): Promise<{
    getPayload(): object | undefined;
  }>;
}

const refuse = (code: GoogleIdTokenRefusal, reason: string): GoogleIdTokenResult => ({ ok: false, code, reason });

/** The library's error, as a refusal code. Its message is never passed on. */
function classify(err: unknown): GoogleIdTokenRefusal {
  const message = err instanceof Error ? err.message : String(err);
  return /expired|used too late/i.test(message) ? "token_expired" : "token_invalid";
}

/**
 * Verifies `idToken` and returns the identity, or why it was refused. The
 * reason is for logs and never holds the token or its claims. Fails closed:
 * a missing claim, a library error or an empty allowlist all refuse.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  config: GoogleIdTokenConfig,
  client: IdTokenClient,
  now: () => number = Date.now
): Promise<GoogleIdTokenResult> {
  if (config.audiences.length === 0) return refuse("token_invalid", "no OAuth client ID configured");
  if (config.hostedDomains.length === 0) return refuse("domain_not_allowed", "no hosted domain allowed");

  let payload: Record<string, unknown> | undefined;
  try {
    // Signature, `aud`, and `exp` (with up to 300 s of slack) are the library's.
    const ticket = await client.verifyIdToken({ idToken, audience: config.audiences });
    payload = ticket.getPayload() as Record<string, unknown> | undefined;
  } catch (err) {
    const code = classify(err);
    return refuse(code, code === "token_expired" ? "expired" : "signature, audience or format");
  }
  if (!payload) return refuse("token_invalid", "no payload");

  const { iss, sub, exp, email, email_verified: emailVerified, hd } = payload;
  if (typeof iss !== "string" || !config.issuers.includes(iss)) return refuse("token_invalid", "issuer");
  if (typeof sub !== "string" || !sub) return refuse("token_invalid", "no subject");
  if (typeof exp !== "number") return refuse("token_invalid", "no expiry");
  if (now() / 1000 > exp + config.clockSkewSeconds) return refuse("token_expired", "expired");
  if (typeof email !== "string" || !email.includes("@")) return refuse("token_invalid", "no email");
  if (emailVerified !== true) return refuse("token_invalid", "email not verified");

  // `hd` first: only Google sets it, for Workspace accounts. A personal
  // account has none and is refused, whatever its email says.
  const hostedDomain = typeof hd === "string" ? hd.toLowerCase() : "";
  if (!hostedDomain || !config.hostedDomains.includes(hostedDomain)) {
    return refuse("domain_not_allowed", hostedDomain ? "hosted domain not allowed" : "no hosted domain");
  }
  const emailDomain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!config.emailDomains.includes(emailDomain)) return refuse("domain_not_allowed", "email domain not allowed");

  return { ok: true, identity: { issuer: iss, subject: sub, email, hostedDomain } };
}

/** The shared Google client: it caches Google's signing keys between calls. */
export const googleIdTokenClient: IdTokenClient = new OAuth2Client();
