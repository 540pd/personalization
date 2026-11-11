import path from "node:path";
import type { Firestore } from "@google-cloud/firestore";
import { currentIsoDate } from "../../utils/date.js";
import { getFirestoreClient } from "../firestore.js";
import { inside, readJson, writeAtomic } from "../localDisk.js";
import { keyedLock } from "../boards/types.js";
import { CorruptIdentityLinkError, type IdentityLink, type IdentityStore, type Owner, type OwnerProfile } from "./types.js";

// The identity store in Firestore, on local disk or in memory (#488), picked
// by storage mode in index.ts like every other store.

const USERS = "users";
const LINKS = "identity_links";

const newOwner = (ownerKey: string, profile: OwnerProfile, now: string): Owner => ({
  ownerKey,
  status: "active",
  email: profile.email,
  hostedDomain: profile.hostedDomain,
  createdAt: now,
  lastLoginAt: now,
});

const refreshed = (owner: Owner, profile: OwnerProfile, now: string): Owner => ({
  ...owner,
  email: profile.email,
  hostedDomain: profile.hostedDomain,
  lastLoginAt: now,
});

/** In memory: tests, and LOCAL_DATA_DIR=memory. */
export function memoryIdentityStore(): IdentityStore {
  const owners = new Map<string, Owner>();
  const links = new Map<string, IdentityLink>();
  const locked = keyedLock();
  return {
    findOrCreate: (linkId, hmacKeyVersion, profile, newOwnerKey) =>
      locked(linkId, async () => {
        const now = currentIsoDate();
        const link = links.get(linkId);
        if (link) {
          const owner = owners.get(link.ownerKey);
          if (!owner) throw new CorruptIdentityLinkError();
          const next = refreshed(owner, profile, now);
          owners.set(owner.ownerKey, next);
          return { owner: { ...next }, created: false };
        }
        if (owners.has(newOwnerKey)) throw new Error("owner key already in use");
        const owner = newOwner(newOwnerKey, profile, now);
        owners.set(newOwnerKey, owner);
        links.set(linkId, { linkId, ownerKey: newOwnerKey, hmacKeyVersion, createdAt: now });
        return { owner: { ...owner }, created: true };
      }),
    async get(ownerKey) {
      const owner = owners.get(ownerKey);
      return owner ? { ...owner } : null;
    },
    async setStatus(ownerKey, status) {
      const owner = owners.get(ownerKey);
      if (owner) owners.set(ownerKey, { ...owner, status });
    },
  };
}

/**
 * JSON files (`<dir>/users/<ownerKey>.json`, `<dir>/identity-links/<linkId>.json`):
 * the local-disk placeholder. One process owns the folder, so a per-link lock
 * stands in for the transaction. The owner is written before its link, so a
 * crash between the two leaves an owner no link reaches, never a link to nothing.
 */
export function localIdentityStore(root: string): IdentityStore {
  const userFile = (ownerKey: string) => inside(path.join(root, "users"), `${ownerKey}.json`);
  const linkFile = (linkId: string) => inside(path.join(root, "identity-links"), `${linkId}.json`);
  const locked = keyedLock();
  const write = (file: string, value: unknown) => writeAtomic(file, JSON.stringify(value, null, 2));
  return {
    findOrCreate: (linkId, hmacKeyVersion, profile, newOwnerKey) =>
      locked(linkId, async () => {
        const now = currentIsoDate();
        const link = await readJson<IdentityLink>(linkFile(linkId));
        if (link) {
          const owner = await readJson<Owner>(userFile(link.ownerKey));
          if (!owner) throw new CorruptIdentityLinkError();
          const next = refreshed(owner, profile, now);
          await write(userFile(owner.ownerKey), next);
          return { owner: next, created: false };
        }
        const owner = newOwner(newOwnerKey, profile, now);
        await write(userFile(newOwnerKey), owner);
        await write(linkFile(linkId), { linkId, ownerKey: newOwnerKey, hmacKeyVersion, createdAt: now } satisfies IdentityLink);
        return { owner, created: true };
      }),
    get: (ownerKey) => readJson<Owner>(userFile(ownerKey)),
    async setStatus(ownerKey, status) {
      const owner = await readJson<Owner>(userFile(ownerKey));
      if (owner) await write(userFile(ownerKey), { ...owner, status });
    },
  };
}

/**
 * users/{ownerKey} and identity_links/{linkId} in Firestore. One transaction
 * reads the link and either refreshes its owner or creates both documents;
 * Firestore retries it on contention, so of two first sign-ins one creates
 * and the other then finds the link. A failure commits nothing.
 */
export function firestoreIdentityStore(db: Firestore = getFirestoreClient()): IdentityStore {
  const users = db.collection(USERS);
  const links = db.collection(LINKS);
  return {
    findOrCreate: (linkId, hmacKeyVersion, profile, newOwnerKey) =>
      db.runTransaction(async (tx) => {
        const now = currentIsoDate();
        const linkRef = links.doc(linkId);
        const linkSnap = await tx.get(linkRef);
        if (linkSnap.exists) {
          const link = linkSnap.data() as IdentityLink;
          const userRef = users.doc(link.ownerKey);
          const userSnap = await tx.get(userRef);
          if (!userSnap.exists) throw new CorruptIdentityLinkError();
          const next = refreshed({ ...(userSnap.data() as Omit<Owner, "ownerKey">), ownerKey: link.ownerKey }, profile, now);
          tx.update(userRef, { email: next.email, hostedDomain: next.hostedDomain, lastLoginAt: now });
          return { owner: next, created: false };
        }
        const owner = newOwner(newOwnerKey, profile, now);
        const { ownerKey: _id, ...userDoc } = owner;
        tx.create(users.doc(newOwnerKey), userDoc);
        tx.create(linkRef, { ownerKey: newOwnerKey, hmacKeyVersion, createdAt: now });
        return { owner, created: true };
      }),
    async get(ownerKey) {
      const snap = await users.doc(ownerKey).get();
      return snap.exists ? { ...(snap.data() as Omit<Owner, "ownerKey">), ownerKey } : null;
    },
    async setStatus(ownerKey, status) {
      try {
        await users.doc(ownerKey).update({ status });
      } catch (err) {
        if ((err as { code?: number }).code !== 5) throw err; // NOT_FOUND: no such owner, as the other stores
      }
    },
  };
}
