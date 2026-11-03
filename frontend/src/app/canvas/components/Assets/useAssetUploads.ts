"use client";

// Adding files to the Assets page (#414, #415, #417, #462): by click, drop or
// paste, each file shows at once and uploads in turn, with Retry when one
// fails. Also what the page keeps about each image beside the draft: its
// pixel size, a logo's reading, and which item's details are open.

import { useEffect, useRef, useState } from "react";
import { listen } from "@/lib/dom/listen";
import { uploadPageAsset } from "@/api/brandAssets.api";
import {
  addUploading,
  isDuplicate,
  isImageKind,
  replaceImage,
  uploadFailed,
  uploadRetried,
  uploaded,
  type AssetsDraft,
  type ImageKind,
} from "../../assets/assetsDraft";
import { checkFile, contentHash, duplicateMessage } from "../../assets/fileChecks";
import { newTempId, rekey, rekeySelected } from "../../assets/uploadIds";
import type { LogoReading } from "../../assets/logoAnalysis";
import type { ImageSize } from "./AssetTiles";
import type { Edit } from "./useAssetsDraft";

const NOTHING_SELECTED: Record<ImageKind, string | null> = {
  productImage: null, adaptFrom: null, styleExample: null, logo: null, reference: null, guidelines: null,
};

/** What every group that takes files is given. */
export interface UploadProps {
  onAddFiles: (files: File[]) => void;
  onRetry: (id: string) => void;
  addError: string | null;
}

/** What every group of images with details is given, beside UploadProps. */
export interface GroupProps extends UploadProps {
  selected: string | null;
  onSelect: (id: string | null) => void;
  sizes: Record<string, ImageSize>;
  onMeasure: (id: string, size: ImageSize) => void;
}

export function useAssetUploads(draft: AssetsDraft | null, edit: Edit) {
  // What the last add refused, shown in the group it was for.
  const [addError, setAddError] = useState<{ kind: ImageKind; message: string } | null>(null);
  // The item whose details are open, in each group.
  const [selected, setSelected] = useState(NOTHING_SELECTED);
  const [sizes, setSizes] = useState<Record<string, ImageSize>>({});
  // What each logo's pixels say: transparency and colours (#417).
  const [readings, setReadings] = useState<Record<string, LogoReading>>({});
  // Each upload's file and kind, for Retry, and each image's content hash, to
  // spot a duplicate (#415). By id: a temporary one until the upload lands.
  const files = useRef(new Map<string, { file: File; kind: ImageKind }>());
  const hashes = useRef(new Map<string, string>());
  // The local copy each upload shows meanwhile, released once it lands.
  const previews = useRef(new Map<string, string>());

  // The latest draft, for checks made between awaits.
  const latest = useRef(draft);
  latest.current = draft;

  /** Starts showing `file` under a new temporary id. */
  const track = (file: File, kind: ImageKind, hash: string) => {
    const tempId = newTempId();
    files.current.set(tempId, { file, kind });
    hashes.current.set(tempId, hash);
    const preview = URL.createObjectURL(file);
    previews.current.set(tempId, preview);
    return { tempId, preview };
  };

  /** What the page keeps under `tempId` moves to the stored asset's `id`. */
  const landed = (tempId: string, id: string) => {
    const hash = hashes.current.get(tempId);
    if (hash) hashes.current.set(id, hash);
    setSizes((s) => rekey(s, tempId, id));
    setReadings((r) => rekey(r, tempId, id));
    setSelected((sel) => rekeySelected(sel, tempId, id));
  };

  const send = async (tempId: string) => {
    const pending = files.current.get(tempId);
    if (!pending) return;
    try {
      const asset = await uploadPageAsset(pending.file, pending.kind);
      files.current.delete(tempId);
      const preview = previews.current.get(tempId);
      previews.current.delete(tempId);
      landed(tempId, asset.id);
      edit((d) => uploaded(d, tempId, asset));
      if (preview) setTimeout(() => URL.revokeObjectURL(preview), 1000);
    } catch (e) {
      edit((d) => uploadFailed(d, tempId, e instanceof Error ? e.message : "Couldn't upload it."));
    }
  };

  /** Click, drop or paste: each file shows at once and uploads in turn. */
  const addFiles = async (picked: File[], kind: ImageKind) => {
    setAddError(null);
    const hadMaster = !!latest.current?.masterId;
    const problems: string[] = [];
    const added: string[] = [];
    for (const file of picked) {
      const wrong = await checkFile(file, kind);
      if (wrong) {
        if (!problems.includes(wrong)) problems.push(wrong);
        continue;
      }
      const hash = await contentHash(file);
      const now = latest.current;
      if (now && (isDuplicate(now, file, hash, hashes.current, kind) || added.some((id) => hashes.current.get(id) === hash))) {
        problems.push(duplicateMessage(file, kind));
        continue;
      }
      const { tempId, preview } = track(file, kind, hash);
      added.push(tempId);
      edit((d) => addUploading(d, tempId, file, preview, kind));
    }
    if (problems.length) setAddError({ kind, message: problems.join(" ") });
    // The first new item opens its details. For product images, with no
    // master yet the first file became it, so that is the second.
    const first = kind !== "productImage" || hadMaster ? added[0] : added[1];
    if (first) setSelected((sel) => ({ ...sel, [kind]: first }));
    for (const id of added) await send(id);
  };

  /** A new file in an image's place (#417: Replace on a logo), its details kept. */
  const replace = async (id: string, file: File) => {
    const kind = latest.current?.images.find((i) => i.asset.id === id)?.asset.kind;
    if (!isImageKind(kind)) return;
    setAddError(null);
    const wrong = await checkFile(file, kind);
    if (wrong) {
      setAddError({ kind, message: wrong });
      return;
    }
    const hash = await contentHash(file);
    const now = latest.current;
    if (now && isDuplicate(now, file, hash, hashes.current, kind)) {
      setAddError({ kind, message: duplicateMessage(file, kind) });
      return;
    }
    const { tempId, preview } = track(file, kind, hash);
    edit((d) => replaceImage(d, id, tempId, file, preview));
    await send(tempId);
  };

  const retry = (tempId: string) => {
    edit((d) => uploadRetried(d, tempId));
    void send(tempId);
  };

  /** After Cancel: no refusal shown, and no upload to retry. */
  const reset = () => {
    setAddError(null);
    files.current.clear();
  };

  // Paste an image from the clipboard (#415). Images only: pasted text is
  // the field's own business. It joins the group that has focus (#416), else
  // the product images. Subscribed once, calling the latest addFiles.
  const addLatest = useRef(addFiles);
  addLatest.current = addFiles;
  useEffect(
    () =>
      listen(window, "paste", (e) => {
        const pasted = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!pasted.length) return;
        e.preventDefault();
        const group = document.activeElement?.closest<HTMLElement>("[data-asset-kind]")?.dataset.assetKind;
        void addLatest.current(pasted, isImageKind(group) ? group : "productImage");
      }),
    [],
  );

  const uploadProps = (kind: ImageKind): UploadProps => ({
    onAddFiles: (picked) => void addFiles(picked, kind),
    onRetry: retry,
    addError: addError?.kind === kind ? addError.message : null,
  });

  const groupProps = (kind: ImageKind): GroupProps => ({
    ...uploadProps(kind),
    selected: selected[kind],
    onSelect: (id) => setSelected((sel) => ({ ...sel, [kind]: id })),
    sizes,
    onMeasure: (id, size) => setSizes((s) => ({ ...s, [id]: size })),
  });

  const onRead = (id: string, reading: LogoReading) => setReadings((r) => ({ ...r, [id]: reading }));

  return { uploadProps, groupProps, replace, reset, readings, onRead };
}
