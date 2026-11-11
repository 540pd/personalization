// Opaque, revocable sessions (#489, PACK NJS-03; docs/aryash rule 3,
// 13_LLD_Storage_Layout.txt). The browser holds a random session ID in the
// HttpOnly gcos_session cookie; the server keeps only its SHA-256 hash, so a
// copy of the store can't be replayed as cookies. Every request reads the
// record and checks it: idle and absolute deadlines, revocation, owner status.

/** login_sessions/{sessionHash}. Times are epoch milliseconds. */
export interface SessionRecord {
  sessionHash: string;
  /** The account's owner (#488); null for dev sign-in, which has no owner. */
  ownerKey: string | null;
  /** What data is keyed by until the owner-key migration. Server-side only. */
  email: string;
  createdAt: number;
  lastSeenAt: number;
  /** Moves forward with use (throttled), never past absoluteExpiresAt. */
  idleExpiresAt: number;
  /** Fixed at sign-in. */
  absoluteExpiresAt: number;
  revokedAt: number | null;
}

export interface SessionStore {
  /** Create-only: a hash that already exists is an error. */
  create(record: SessionRecord): Promise<void>;
  get(sessionHash: string): Promise<SessionRecord | null>;
  /** Records use, if the session still exists and isn't revoked. */
  touch(sessionHash: string, lastSeenAt: number, idleExpiresAt: number): Promise<void>;
  /** Marks it revoked (kept, so a replay is refused, not "unknown"). */
  revoke(sessionHash: string, at: number): Promise<void>;
  /** Revokes every live session of `ownerKey`; returns how many. */
  revokeAllForOwner(ownerKey: string, at: number): Promise<number>;
}
