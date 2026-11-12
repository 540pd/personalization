import { createHmac, randomBytes } from "node:crypto";
import { isDeployed } from "../allowedOrigins.js";

// The server secret identity links are keyed with (#488). IDENTITY_LINK_HMAC_KEY
// holds at least 32 random bytes (hex or base64); Secret Manager on Cloud Run.
// The version is part of every link ID, so a new key makes new links and never
// a second owner for anyone: a rotation migrates links, owner keys stay.

export interface LinkKey {
  key: Buffer;
  version: number;
  /** Made at startup because none was set: links don't survive a restart. */
  ephemeral: boolean;
}

const MIN_KEY_BYTES = 32;

function decode(text: string): Buffer | null {
  if (/^[0-9a-f]+$/i.test(text) && text.length % 2 === 0) return Buffer.from(text, "hex");
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) return Buffer.from(text, text.includes("-") || text.includes("_") ? "base64url" : "base64");
  return null;
}

/**
 * The key from the environment. Unset: a deployed backend refuses (throws),
 * a local one makes a key for this process and says so. Throws on a key too
 * short or a version that isn't a positive whole number.
 */
export function linkKey(env: NodeJS.ProcessEnv = process.env, deployed = isDeployed(env)): LinkKey {
  const text = env.IDENTITY_LINK_HMAC_KEY?.trim();
  const versionText = env.IDENTITY_LINK_HMAC_KEY_VERSION?.trim() || "1";
  const version = Number(versionText);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`IDENTITY_LINK_HMAC_KEY_VERSION must be a whole number from 1, got "${versionText}".`);
  }
  if (!text) {
    if (deployed) {
      throw new Error(
        "Refusing to start: deployed without IDENTITY_LINK_HMAC_KEY. Set it from Secret Manager (docs/switching-to-gcp.md, Sign-in: Google)."
      );
    }
    return { key: randomBytes(MIN_KEY_BYTES), version, ephemeral: true };
  }
  const key = decode(text);
  if (!key || key.length < MIN_KEY_BYTES) {
    throw new Error(`IDENTITY_LINK_HMAC_KEY must be at least ${MIN_KEY_BYTES} bytes, hex or base64 (e.g. openssl rand -hex 32).`);
  }
  return { key, version, ephemeral: false };
}

/**
 * The link ID for one Google account: `v<version>_` + hex HMAC-SHA256 over the
 * issuer and subject, NUL-separated so ("a", "bc") and ("ab", "c") differ.
 */
export function linkIdFor(issuer: string, subject: string, key: LinkKey): string {
  const mac = createHmac("sha256", key.key).update(`${issuer}\0${subject}`).digest("hex");
  return `v${key.version}_${mac}`;
}
