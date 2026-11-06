"use client";

// The pieces every image group on the Assets page shares: a tile with its
// upload overlay and low-resolution flag, the "+ Add" tile, the drop zone
// and the low-resolution warning (#415). Product views (#414), creatives to
// adapt from and style examples (#416) all use them.

import { useRef, useState, type DragEvent, type ReactNode, type SyntheticEvent } from "react";
import { isLowRes, type DraftImage } from "../../assets/assetsDraft";

export type ImageSize = { width: number; height: number };

/** Reads an image's pixel size once it has loaded. */
export const measured = (image: DraftImage, onMeasure: (id: string, size: ImageSize) => void) =>
  (e: SyntheticEvent<HTMLImageElement>) =>
    onMeasure(image.asset.id, { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight });

const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/**
 * Files dropped on an element, with whether a drag is over it. The drop is
 * the element's own: it stops here, so neither the page nor the board
 * underneath acts on it too (#206).
 */
export function useDropZone(onFiles: (files: File[]) => void) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  return {
    active,
    handlers: {
      onDragEnter: (e: DragEvent) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        depth.current += 1;
        setActive(true);
      },
      onDragOver: (e: DragEvent) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: (e: DragEvent) => {
        if (!isFileDrag(e)) return;
        e.stopPropagation();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      },
      onDrop: (e: DragEvent) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        depth.current = 0;
        setActive(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      },
    },
  };
}

/** A small image in a group: select it to open its details. */
export function ImageTile({
  image,
  caption,
  selected,
  onSelect,
  size,
  onMeasure,
  onRetry,
  onRemove,
  badges,
}: {
  image: DraftImage;
  caption: string;
  /** Small labels under the caption (#418: a reference's type, Always). */
  badges?: ReactNode;
  selected: boolean;
  onSelect: () => void;
  size: ImageSize | undefined;
  onMeasure: (id: string, size: ImageSize) => void;
  onRetry: (id: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="assets-tile-wrap">
      <button
        type="button"
        className={["assets-tile", selected && "is-selected", image.upload?.state === "failed" && "is-failed"].filter(Boolean).join(" ")}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- an asset behind the signed-in proxy (or a local copy), which next/image cannot fetch */}
        <img src={image.asset.url} alt="" onLoad={measured(image, onMeasure)} />
        <span>{image.upload?.state === "uploading" ? "Uploading…" : caption}</span>
        {badges && <span className="assets-tile-badges">{badges}</span>}
      </button>
      {isLowRes(size) && (
        <span className="assets-tile-flag" title="Low resolution" aria-label="Low resolution">
          !
        </span>
      )}
      <UploadOverlay image={image} onRetry={onRetry} onRemove={onRemove} compact />
    </div>
  );
}

/** The dashed "+ Add …" tile at the end of a group. */
export function AddTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="assets-add" onClick={onClick}>
      <span aria-hidden>+</span>
      {label}
      <small>or drop or paste</small>
    </button>
  );
}

/** Over an image still uploading (a spinner) or failed (why, Retry, Remove). */
export function UploadOverlay({
  image,
  onRetry,
  onRemove,
  compact,
}: {
  image: DraftImage;
  onRetry: (id: string) => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  if (!image.upload) return null;
  const className = compact ? "assets-overlay is-compact" : "assets-overlay";
  if (image.upload.state === "uploading") {
    return (
      <div className={className} role="status">
        <span className="assets-spinner" aria-hidden />
        {!compact && "Uploading…"}
        {compact && <span className="sr-only">Uploading {image.asset.name}</span>}
      </div>
    );
  }
  return (
    <div className={`${className} is-failed`} role="alert">
      <span>Couldn&apos;t save it</span>
      {!compact && <span className="assets-overlay-reason">{image.upload.error}</span>}
      <span className="assets-overlay-actions">
        <button type="button" className="assets-pill" onClick={() => onRetry(image.asset.id)} title={image.upload.error}>
          Retry
        </button>
        {!compact && (
          <button type="button" className="assets-danger" onClick={onRemove}>
            Remove
          </button>
        )}
      </span>
    </div>
  );
}

export function LowResWarning({ size }: { size: ImageSize | undefined }) {
  if (!isLowRes(size)) return null;
  return (
    <div className="assets-warning" role="status">
      <strong>Low resolution.</strong> This image is {size!.width} px wide. Generated images may look soft; 1500 px or more
      works best.
    </div>
  );
}
