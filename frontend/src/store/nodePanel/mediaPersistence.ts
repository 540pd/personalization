import type { PanelInstance } from "./types";

const DB_NAME = "gcos-panel-media";
const STORE = "outputs";
const PREFIX = "gcos-panel-media:";
const cached = new Map<string, { value: string; key: string }>();

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(key: string, value: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function read(key: string): Promise<string | undefined> {
  const db = await openDB();
  try {
    return await new Promise<string | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

/** Durable URLs and text stay in localStorage. Only large inline media needs IndexedDB. */
export function persistPanelMedia(panels: PanelInstance[]): PanelInstance[] {
  if (typeof indexedDB === "undefined") return panels;
  return panels.map((panel) => {
    const output = panel.output;
    if (!output || (output.type !== "image" && output.type !== "video") || !output.value.startsWith("data:")) {
      return panel;
    }
    const previous = cached.get(panel.id);
    const key = previous?.value === output.value ? previous.key : `${PREFIX}${crypto.randomUUID()}`;
    if (!previous || previous.value !== output.value) {
      cached.set(panel.id, { value: output.value, key });
      void write(key, output.value).catch((err) => console.warn("[nodePanel] Could not save generated media.", err));
    }
    return { ...panel, output: { ...output, value: key } };
  });
}

/** Restore each saved output into its own node; never overwrite a newer generation. */
export async function restorePanelMedia(
  panels: PanelInstance[],
  getPanels: () => PanelInstance[],
  setOutput: (id: string, output: NonNullable<PanelInstance["output"]>) => void,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await Promise.all(panels.map(async (panel) => {
    const output = panel.output;
    if (!output?.value.startsWith(PREFIX)) return;
    try {
      const value = await read(output.value);
      if (!value || getPanels().find((p) => p.id === panel.id)?.output?.value !== output.value) return;
      cached.set(panel.id, { key: output.value, value });
      setOutput(panel.id, { ...output, value });
    } catch (err) {
      console.warn("[nodePanel] Could not restore generated media.", err);
    }
  }));
}