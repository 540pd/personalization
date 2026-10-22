import type { Firestore } from "@google-cloud/firestore";
import { getFirestoreClient } from "../firestore.js";
import type { Job, JobStore } from "./types.js";

const JOBS = "jobs";

/**
 * jobs/{id} in Firestore. claim and finish run in transactions, so two
 * instances -- or a task Cloud Tasks retried -- never run one job twice.
 * Old jobs are for a TTL policy on createdAt to remove (docs, #326).
 */
export function firestoreJobStore(db: Firestore = getFirestoreClient()): JobStore {
  const jobs = db.collection(JOBS);
  const doc = (id: string) => jobs.doc(id);
  const toJob = (id: string, data: unknown) => ({ ...(data as Omit<Job, "id">), id }) as Job;

  return {
    async create(job) {
      const { id, ...data } = job;
      await doc(id).create(data);
    },
    async get(id, userId) {
      const snap = await doc(id).get();
      const job = snap.exists ? toJob(id, snap.data()) : null;
      return job?.userId === userId ? job : null;
    },
    claim(id) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(doc(id));
        if (!snap.exists || snap.data()?.status !== "queued") return null;
        const startedAt = new Date().toISOString();
        tx.update(doc(id), { status: "running", startedAt });
        return { ...toJob(id, snap.data()), status: "running" as const, startedAt };
      });
    },
    async finish(id, outcome) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(doc(id));
        const status = snap.data()?.status;
        if (!snap.exists || status === "done" || status === "failed") return;
        tx.update(doc(id), {
          ...("result" in outcome ? { status: "done", result: outcome.result } : { status: "failed", error: outcome.error }),
          finishedAt: new Date().toISOString(),
        });
      });
    },
    async unfinished() {
      const snap = await jobs.where("status", "in", ["queued", "running"]).get();
      return snap.docs.map((d) => toJob(d.id, d.data()));
    },
    async requeue(id) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(doc(id));
        if (snap.data()?.status !== "running") return;
        tx.update(doc(id), { status: "queued", startedAt: null });
      });
    },
  };
}
