"use client";

// Section 1 of the Assets page (#414): the product's name and SKU, its
// master image shown large, and its other views, each with its details.
// Images arrive by click, drop or paste, several at once, and show while
// they upload (#415).

import { useId, useRef, useState, type DragEvent } from "react";
import { pickFiles } from "@/lib/dom/pickFile";
import {
  PRODUCT_IMAGE_TYPES,
  PRODUCT_IMAGE_TYPES_ACCEPTED,
  PRODUCT_VIEWS,
  editImage,
  isLowRes,
  makeMaster,
  master,
  otherViews,
  removeImage,
  type AssetsDraft,
  type DraftImage,
} from "../../assets/assetsDraft";

type Edit = (update: (d: AssetsDraft) => AssetsDraft) => void;
export type ImageSize = { width: number; height: number };

export default function ProductSection({
  draft,
  onChange,
  onAddFiles,
  onRetry,
  selected,
  onSelect,
  sizes,
  onMeasure,
  addError,
  missingMaster,
  missingName,
}: {
  draft: AssetsDraft;
  onChange: Edit;
  onAddFiles: (files: File[]) => void;
  onRetry: (id: string) => void;
  /** The view whose details are open; the first view when it is null. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Each image's pixel size, once it has loaded. */
  sizes: Record<string, ImageSize>;
  onMeasure: (id: string, size: ImageSize) => void;
  addError: string | null;
  missingMaster: boolean;
  missingName: boolean;
}) {
  const id = useId();
  const hero = master(draft);
  const views = otherViews(draft);
  const current = views.find((v) => v.asset.id === selected) ?? views[0] ?? null;
  const add = () => pickFiles(PRODUCT_IMAGE_TYPES_ACCEPTED.join(","), onAddFiles);
  const emptyDrop = useDropZone(onAddFiles);
  const viewsDrop = useDropZone(onAddFiles);
  const measure = (image: DraftImage) => (e: React.SyntheticEvent<HTMLImageElement>) =>
    onMeasure(image.asset.id, { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight });

  return (
    <section className="assets-section" aria-labelledby={`${id}-title`}>
      <div>
        <div className="assets-section-head">
          <h2 id={`${id}-title`} className="assets-section-title">
            1 · Product / Master Creative
          </h2>
          <span className="assets-tag">Required</span>
        </div>
        <p className="assets-lead">The product Content Studio should use as the source for generation.</p>
      </div>

      <div className="assets-fields">
        <div className="assets-field">
          <label htmlFor={`${id}-name`} className="assets-label">
            Product Name <span className="assets-required" aria-hidden>*</span>
          </label>
          <input
            id={`${id}-name`}
            className={missingName ? "assets-input is-missing" : "assets-input"}
            placeholder="Trail running shoe"
            aria-required
            aria-invalid={missingName || undefined}
            value={draft.productName}
            onChange={(e) => {
              const productName = e.target.value;
              onChange((d) => ({ ...d, productName }));
            }}
          />
          {missingName && <span className="assets-field-error">Add the product name.</span>}
        </div>
        <div className="assets-field">
          <label htmlFor={`${id}-sku`} className="assets-label">
            SKU / Product ID <span className="assets-muted">(optional)</span>
          </label>
          <input
            id={`${id}-sku`}
            className="assets-input"
            placeholder="TRS-WHT-001"
            value={draft.sku}
            onChange={(e) => {
              const sku = e.target.value;
              onChange((d) => ({ ...d, sku }));
            }}
          />
        </div>
      </div>

      {!hero ? (
        <div
          className={["assets-empty", missingMaster && "is-missing", emptyDrop.active && "is-dropping"].filter(Boolean).join(" ")}
          {...emptyDrop.handlers}
        >
          <strong>No product image added yet.</strong>
          <span className="assets-muted">Upload at least one product image to start generating creatives.</span>
          <button type="button" className="assets-primary" onClick={add}>
            Upload product image
          </button>
          <span className="assets-hint">or drop or paste images here · PNG or JPG · high resolution works best</span>
          {addError && <span className="assets-field-error" role="alert">{addError}</span>}
        </div>
      ) : (
        <div className="assets-product">
          <div className="assets-master">
            <div className="assets-col-head">
              <span className="assets-label">
                Master image <span className="assets-required" aria-hidden>*</span>
              </span>
              <span className="assets-hint">The main reference for generation</span>
            </div>
            <div className="assets-master-frame">
              {/* eslint-disable-next-line @next/next/no-img-element -- an asset behind the signed-in proxy (or a local copy), which next/image cannot fetch */}
              <img src={hero.asset.url} alt={hero.description || `Master image: ${hero.asset.name}`} onLoad={measure(hero)} />
              <span className="assets-badge">Master</span>
              <UploadOverlay image={hero} onRetry={onRetry} onRemove={() => onChange((d) => removeImage(d, hero.asset.id))} />
            </div>
            <LowResWarning size={sizes[hero.asset.id]} />
            <ImageDetails image={hero} onChange={onChange} />
            <button
              type="button"
              className="assets-danger"
              onClick={() => {
                onChange((d) => removeImage(d, hero.asset.id));
                onSelect(null);
              }}
            >
              Remove master image
            </button>
          </div>

          <div className={viewsDrop.active ? "assets-views is-dropping" : "assets-views"} {...viewsDrop.handlers}>
            <div className="assets-col-head">
              <span className="assets-label">
                Other views <span className="assets-muted">(optional)</span>
              </span>
              <span className="assets-hint">Improve product fidelity</span>
            </div>
            <div className="assets-grid">
              {views.map((v) => (
                <div key={v.asset.id} className="assets-tile-wrap">
                  <button
                    type="button"
                    className={[
                      "assets-tile",
                      current?.asset.id === v.asset.id && "is-selected",
                      v.upload?.state === "failed" && "is-failed",
                    ].filter(Boolean).join(" ")}
                    aria-pressed={current?.asset.id === v.asset.id}
                    onClick={() => onSelect(v.asset.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
                    <img src={v.asset.url} alt="" onLoad={measure(v)} />
                    <span>{v.upload?.state === "uploading" ? "Uploading…" : caption(v)}</span>
                  </button>
                  {isLowRes(sizes[v.asset.id]) && (
                    <span className="assets-tile-flag" title="Low resolution" aria-label="Low resolution">
                      !
                    </span>
                  )}
                  <UploadOverlay image={v} onRetry={onRetry} onRemove={() => onChange((d) => removeImage(d, v.asset.id))} compact />
                </div>
              ))}
              <button type="button" className="assets-add" onClick={add}>
                <span aria-hidden>+</span>
                Add view
                <small>or drop or paste</small>
              </button>
            </div>
            {addError && <span className="assets-field-error" role="alert">{addError}</span>}
            <span className="assets-hint">Suggested: side, back, close-up of details.</span>

            {current && (
              <div className="assets-details" role="group" aria-label="View details">
                <LowResWarning size={sizes[current.asset.id]} />
                <ImageDetails image={current} onChange={onChange} />
                <div className="assets-details-actions">
                  <button
                    type="button"
                    className="assets-pill"
                    disabled={!!current.upload}
                    onClick={() => onChange((d) => makeMaster(d, current.asset.id))}
                  >
                    Make master
                  </button>
                  <button
                    type="button"
                    className="assets-danger"
                    onClick={() => {
                      onChange((d) => removeImage(d, current.asset.id));
                      onSelect(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/**
 * Files dropped on an element, with whether a drag is over it. The drop is
 * the element's own: it stops here, so neither the page nor the board
 * underneath acts on it too (#206).
 */
function useDropZone(onFiles: (files: File[]) => void) {
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

/** Over an image still uploading (a spinner) or failed (why, Retry, Remove). */
function UploadOverlay({
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

function LowResWarning({ size }: { size: ImageSize | undefined }) {
  if (!isLowRes(size)) return null;
  return (
    <div className="assets-warning" role="status">
      <strong>Low resolution.</strong> This image is {size!.width} px wide. Generated images may look soft; 1500 px or more
      works best.
    </div>
  );
}

/** What a view's tile says: its description, else its view and type, else its file. */
function caption(image: DraftImage): string {
  return image.description || [image.details.view, image.details.imageType].filter(Boolean).join(" · ") || image.asset.name || "Product image";
}

/** Description, type, view and variant: the same fields for the master and every view. */
function ImageDetails({ image, onChange }: { image: DraftImage; onChange: Edit }) {
  const id = useId();
  const set = (details: Record<string, string>) => onChange((d) => editImage(d, image.asset.id, { details }));
  return (
    <div className="assets-image-fields">
      <div className="assets-field">
        <label htmlFor={`${id}-desc`} className="assets-label">
          Description
        </label>
        <textarea
          id={`${id}-desc`}
          className="assets-input assets-textarea"
          rows={2}
          placeholder="White trail shoe, side view, on a plain light background"
          value={image.description}
          onChange={(e) => {
            const description = e.target.value;
            onChange((d) => editImage(d, image.asset.id, { description }));
          }}
        />
      </div>
      <div className="assets-row3">
        <div className="assets-field">
          <label htmlFor={`${id}-type`} className="assets-label-sm">
            Type
          </label>
          <select id={`${id}-type`} className="assets-input" value={image.details.imageType ?? ""} onChange={(e) => set({ imageType: e.target.value })}>
            <option value="">Choose a type</option>
            {PRODUCT_IMAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="assets-field">
          <label htmlFor={`${id}-view`} className="assets-label-sm">
            View
          </label>
          <select id={`${id}-view`} className="assets-input" value={image.details.view ?? ""} onChange={(e) => set({ view: e.target.value })}>
            <option value="">Choose a view</option>
            {PRODUCT_VIEWS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="assets-field">
          <label htmlFor={`${id}-variant`} className="assets-label-sm">
            Variant
          </label>
          <input
            id={`${id}-variant`}
            className="assets-input"
            placeholder="White / orange"
            value={image.details.variant ?? ""}
            onChange={(e) => set({ variant: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
