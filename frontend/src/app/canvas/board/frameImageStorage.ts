// Only uploaded images belonging to a Frame are restored on reload. Frames
// themselves are saved synchronously by frame.store, while bitmap data lives
// in IndexedDB (localStorage's small quota cannot hold several photographs).
import Konva from "konva";
import type { FrameRecord } from "@/store/frame.store";
import { useKonvaNodes, type KonvaNodeRecord } from "@/store/konvaNodes.store";
import { boundsOf, containsBox } from "@/lib/canvas/bounds";
import { NODE_CORNER_RADIUS } from "@/constants/canvas.constants";
import { syncNodeGeometry } from "./geometry";

const META_KEY = "gcos-frame-images";
const DB_NAME = "gcos-frame-media";
const STORE = "bitmaps";

type ImagePosition = Pick<KonvaNodeRecord, "id" | "canvasX" | "canvasY" | "canvasW" | "canvasH" | "label">;

export function saveFrameImagePositions(frames: Record<string, FrameRecord>): void {
  if (typeof window === "undefined") return;
  const images = Object.values(useKonvaNodes.getState().nodes)
    .filter((n) => !!n.imageUrl && Object.values(frames).some((f) =>
      containsBox({ x: f.canvasX, y: f.canvasY, w: f.canvasW, h: f.canvasH }, boundsOf(n))))
    .map(({ id, canvasX, canvasY, canvasW, canvasH, label }): ImagePosition =>
      ({ id, canvasX, canvasY, canvasW, canvasH, label }));
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(images));
  } catch (err) {
    console.warn("[frames] Could not save image positions for reload.", err);
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Complete before placing the image on the board: a user who immediately
// frames it and refreshes cannot race a still-pending bitmap write.
export async function saveFrameBitmap(id: string, url: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(url, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function readBitmap(db: IDBDatabase, id: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : undefined);
    request.onerror = () => reject(request.error);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode saved image"));
    image.src = url;
  });
}

/** Reconstruct image shapes on Board's stage, without restoring selection. */
export async function restoreFrameImages(layer: Konva.Layer): Promise<void> {
  let images: ImagePosition[];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(META_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return;
    images = parsed;
  } catch {
    return;
  }
  if (!images.length) return;
  let db: IDBDatabase;
  try { db = await openDB(); }
  catch (err) { console.warn("[frames] Could not open saved images.", err); return; }
  try {
    for (const rec of images) {
      if (!rec || typeof rec.id !== "string" || layer.findOne(`#${rec.id}`)) continue;
      try {
        const url = await readBitmap(db, rec.id);
        if (!url) continue;
        const image = await loadImage(url);
        const node = new Konva.Image({
          id: rec.id, image, name: "selectable",
          x: rec.canvasX, y: rec.canvasY, width: rec.canvasW, height: rec.canvasH,
          cornerRadius: NODE_CORNER_RADIUS,
          stroke: "rgba(255,255,255,0.95)", strokeWidth: 1.5, strokeScaleEnabled: false,
          hitFunc(ctx: Konva.Context, shape: Konva.Shape) {
            ctx.beginPath();
            ctx.rect(0, 0, shape.width(), shape.height());
            ctx.closePath();
            ctx.fillStrokeShape(shape);
          },
        });
        layer.add(node);
        useKonvaNodes.getState().upsert({ ...rec, imageUrl: url });
        syncNodeGeometry(node);
      } catch (err) {
        console.warn("[frames] Could not restore an uploaded image.", err);
      }
    }
    layer.batchDraw();
  } finally {
    db.close();
  }
}
