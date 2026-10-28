// Files under LOCAL_DATA_DIR for the local-disk placeholder (#333): the
// stand-in for Firestore and Cloud Storage while nobody has GCP access.

import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** `dir/name`, refusing a name that would step outside `dir`. Ids are
 * UUIDs; this keeps a crafted one from reaching any other file. */
export function inside(dir: string, name: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith(".")) throw new Error(`Unsafe file name: ${name}`);
  return path.join(dir, name);
}

/**
 * Writes `data` to `file` all at once: a temp file beside it, then a
 * rename, which replaces atomically -- a crash mid-write never leaves half
 * a file where a whole one was.
 */
export async function writeAtomic(file: string, data: string | Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, data);
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/** The parsed JSON in `file`, or null when there is no such file. */
export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Every JSON document in `dir`, skipping temp files; none when it is missing. */
export async function readAllJson<T>(dir: string): Promise<T[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const docs = await Promise.all(names.filter((n) => n.endsWith(".json")).map((n) => readJson<T>(path.join(dir, n))));
  return docs.filter((d): d is Awaited<T> => d !== null) as T[];
}

export const removeFile = (file: string) => rm(file, { force: true });
