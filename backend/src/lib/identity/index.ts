import { randomBytes } from "node:crypto";
import { storeFor } from "../storageMode.js";
import type { VerifiedGoogleIdentity } from "../googleIdToken.js";
import { linkIdFor, linkKey, type LinkKey } from "./linkKey.js";
import { firestoreIdentityStore, localIdentityStore, memoryIdentityStore } from "./stores.js";
import { CorruptIdentityLinkError, type IdentityStore, type Owner } from "./types.js";

export type { IdentityStore, Owner, OwnerStatus } from "./types.js";
export { linkIdFor, linkKey } from "./linkKey.js";

const pickIdentityStore = storeFor<IdentityStore>({ firestore: () => firestoreIdentityStore(), local: localIdentityStore, memory: memoryIdentityStore });

/** The identity store for this process's storage mode, made on first use. */
export function identityStore(): IdentityStore {
  return pickIdentityStore();
}

/** A new owner key: `usr_` (the form the FastAPI service requires) + 24 random bytes, opaque, never derived from the account. */
export function newOwnerKey(): string {
  return `usr_${randomBytes(24).toString("base64url")}`;
}

export type OwnerResult =
  | { ok: true; ownerKey: string; created: boolean }
  | { ok: false; code: "account_disabled" | "identity_unavailable"; reason: string };

/** How long a known, active owner is trusted without reading the store again. */
export const OWNER_CACHE_MS = 10_000;

export interface OwnerServiceDeps {
  store: IdentityStore;
  key: LinkKey;
  now?: () => number;
  makeOwnerKey?: () => string;
}

/**
 * findOrCreateOwner (#488, PACK NJS-02): the owner a verified Google identity
 * belongs to, made on its first sign-in. Only the verified issuer and subject
 * decide which owner; nothing from the request can. A disabled owner is
 * refused, never re-created. The store failing refuses too (fail closed).
 * A recent answer for an active owner is reused for OWNER_CACHE_MS, so a
 * request carrying a Google token doesn't read the store every time; a status
 * change through setOwnerStatus clears it at once in this process.
 */
export function ownerService({ store, key, now = Date.now, makeOwnerKey = newOwnerKey }: OwnerServiceDeps) {
  const cache = new Map<string, { ownerKey: string; at: number }>();

  async function findOrCreateOwner(identity: VerifiedGoogleIdentity): Promise<OwnerResult> {
    const linkId = linkIdFor(identity.issuer, identity.subject, key);
    const hit = cache.get(linkId);
    if (hit && now() - hit.at < OWNER_CACHE_MS) return { ok: true, ownerKey: hit.ownerKey, created: false };

    let result: { owner: Owner; created: boolean };
    try {
      result = await store.findOrCreate(linkId, key.version, { email: identity.email, hostedDomain: identity.hostedDomain }, makeOwnerKey());
    } catch (err) {
      cache.delete(linkId);
      const reason = err instanceof CorruptIdentityLinkError ? "identity link points at a missing owner" : "identity store unavailable";
      return { ok: false, code: "identity_unavailable", reason };
    }
    if (result.owner.status !== "active") {
      cache.delete(linkId);
      return { ok: false, code: "account_disabled", reason: "owner disabled" };
    }
    cache.set(linkId, { ownerKey: result.owner.ownerKey, at: now() });
    return { ok: true, ownerKey: result.owner.ownerKey, created: result.created };
  }

  /** Trusted, server-side only: no route reaches it. */
  async function setOwnerStatus(ownerKey: string, status: Owner["status"]): Promise<void> {
    await store.setStatus(ownerKey, status);
    for (const [linkId, entry] of cache) if (entry.ownerKey === ownerKey) cache.delete(linkId);
  }

  return { findOrCreateOwner, setOwnerStatus };
}

let _service: ReturnType<typeof ownerService> | null = null;
let _key: LinkKey | null = null;

/**
 * The process's link key, read once. Throws when deployed without one, so
 * calling this at startup (requireIdentity) refuses to start.
 */
export function processLinkKey(): LinkKey {
  if (!_key) {
    _key = linkKey();
    if (_key.ephemeral) {
      console.warn("[identity] IDENTITY_LINK_HMAC_KEY not set — using a key made for this process: identity links won't survive a restart (local only).");
    }
  }
  return _key;
}

/** The process-wide owner service, on the process's store and key. */
export function owners(): ReturnType<typeof ownerService> {
  _service ??= ownerService({ store: identityStore(), key: processLinkKey() });
  return _service;
}
