import { invalidInput, missingOwner } from "./errors.js";
import type { ServicePrincipal } from "./types.js";

// What the service accepts, checked before anything is sent (#494, #533).
// The real client and the fake both check input here, so the placeholder
// refuses exactly what the real client refuses.

const OWNER_FIELDS = new Set(["ownerKey", "owner_key", "owner"]);
/** The service accepts `usr_…`, at most 128 characters (app/security.py). */
const OWNER_KEY = /^usr_[A-Za-z0-9_-]{1,124}$/;
/** The service wants 8–128 characters (app/main.py). */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,128}$/;
const PATH_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Refuses input that tries to say whose call this is: that is the session's to say. */
export function assertNoOwnerField(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(assertNoOwnerField);
  if (!value || typeof value !== "object") return;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (OWNER_FIELDS.has(key)) throw invalidInput("The owner comes from the session, not the request.");
    assertNoOwnerField(v);
  }
}

/** A call needs a session-derived owner in the service's form. */
export function assertOwner(principal: ServicePrincipal | undefined): void {
  if (!principal?.ownerKey || !OWNER_KEY.test(principal.ownerKey)) throw missingOwner();
}

export function assertPublishKey(key: string): void {
  if (!IDEMPOTENCY_KEY.test(key)) throw invalidInput("The publish key isn't valid.");
}

/** An ID as a URL path segment. Dots are allowed, but "." and ".." would walk the service's path. */
export function pathSegment(value: string, what: string): string {
  if (!PATH_ID.test(value) || value === "." || value.includes("..")) throw invalidInput(`That ${what} isn't valid.`);
  return encodeURIComponent(value);
}
