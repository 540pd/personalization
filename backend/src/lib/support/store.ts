// Support messages (#428): each one kept before it is emailed, so an email
// that fails -- or no email set up yet -- never loses a message. Kept in
// Firestore, on local disk or in memory by storageMode.ts, like boards.

import path from "node:path";
import type { Firestore } from "@google-cloud/firestore";
import { getFirestoreClient, isFirestoreMode } from "../firestore.js";
import { inside, readAllJson, writeAtomic } from "../localDisk.js";
import { localDataDir } from "../storageMode.js";

/** What the page says about where the sender was; every field optional. */
export interface SupportContext {
  page?: string;
  boardId?: string;
  appVersion?: string;
  userAgent?: string;
}

export interface SupportMessage {
  id: string;
  createdAt: string;
  name: string;
  /** Where the reply goes: always what the sender typed. */
  email: string;
  clientProject: boolean;
  message: string;
  context: SupportContext;
  /** The signed-in account, if any: for spam checks, never for replies. */
  account: string | null;
}

export interface SupportStore {
  save(message: SupportMessage): Promise<void>;
  /** Oldest first. */
  list(): Promise<SupportMessage[]>;
}

const byOldest = (a: SupportMessage, b: SupportMessage) => a.createdAt.localeCompare(b.createdAt);

export function memorySupportStore(): SupportStore {
  const messages: SupportMessage[] = [];
  return {
    async save(message) {
      messages.push(message);
    },
    async list() {
      return [...messages].sort(byOldest);
    },
  };
}

/** One JSON file per message, `<dir>/support/<id>.json`. */
export function localSupportStore(root: string): SupportStore {
  const dir = path.join(root, "support");
  return {
    save: (message) => writeAtomic(inside(dir, `${message.id}.json`), JSON.stringify(message, null, 2)),
    list: async () => (await readAllJson<SupportMessage>(dir)).sort(byOldest),
  };
}

/** support/{id} in Firestore. */
export function firestoreSupportStore(db: Firestore = getFirestoreClient()): SupportStore {
  const support = db.collection("support");
  return {
    async save({ id, ...data }) {
      await support.doc(id).create(data);
    },
    async list() {
      const snap = await support.get();
      return snap.docs.map((d) => ({ ...(d.data() as Omit<SupportMessage, "id">), id: d.id })).sort(byOldest);
    },
  };
}

let _store: SupportStore | null = null;

/** The store for this process's storage mode, made on first use. */
export function supportStore(): SupportStore {
  if (!_store) {
    const dir = localDataDir();
    _store = isFirestoreMode() ? firestoreSupportStore() : dir ? localSupportStore(dir) : memorySupportStore();
  }
  return _store;
}
