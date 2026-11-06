"use client";

// Section 1 of the Assets page (#414): the product's name and SKU, its
// master image shown large, and its other views, each with its details.
// Images arrive by click, drop or paste, several at once, and show while
// they upload (#415). Last comes the creative to adapt from (#416), passed
// in as `children`.

import { useId, type ReactNode } from "react";
import { pickFiles } from "@/lib/dom/pickFile";
import {
  PRODUCT_IMAGE_TYPES,
  PRODUCT_IMAGE_TYPES_ACCEPTED,
  PRODUCT_VIEWS,
  editImage,
  makeMaster,
  master,
  otherViews,
  removeImage,
  type AssetsDraft,
  type DraftImage,
} from "../../assets/assetsDraft";
import { AddTile, ImageTile, LowResWarning, UploadOverlay, measured, useDropZone, type ImageSize } from "./AssetTiles";

type Edit = (update: (d: AssetsDraft) => AssetsDraft) => void;

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
  place,
  children,
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
  /**
   * Place on the board (#446): why it cannot be done now, or null when it
   * can; and doing it.
   */
  place: { blocked: string | null; onPlace: () => void };
  children?: ReactNode;
}) {
  const id = useId();
  const hero = master(draft);
  const views = otherViews(draft);
  const current = views.find((v) => v.asset.id === selected) ?? views[0] ?? null;
  const add = () => pickFiles(PRODUCT_IMAGE_TYPES_ACCEPTED.join(","), onAddFiles);
  const emptyDrop = useDropZone(onAddFiles);
  const viewsDrop = useDropZone(onAddFiles);

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
        {/* The readiness strip links here (#419). */}
        <div className="assets-field" id="assets-product-name">
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
          id="assets-master"
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
          <div className="assets-master" id="assets-master">
            <div className="assets-col-head">
              <span className="assets-label">
                Master image <span className="assets-required" aria-hidden>*</span>
              </span>
              <span className="assets-hint">The main reference for generation</span>
            </div>
            <div className="assets-master-frame">
              {/* eslint-disable-next-line @next/next/no-img-element -- an asset behind the signed-in proxy (or a local copy), which next/image cannot fetch */}
              <img src={hero.asset.url} alt={hero.description || `Master image: ${hero.asset.name}`} onLoad={measured(hero, onMeasure)} />
              <span className="assets-badge">Master</span>
              <UploadOverlay image={hero} onRetry={onRetry} onRemove={() => onChange((d) => removeImage(d, hero.asset.id))} />
            </div>
            <LowResWarning size={sizes[hero.asset.id]} />
            <ImageDetails image={hero} onChange={onChange} />
            <div className="assets-master-actions">
              <button
                type="button"
                className="assets-pill"
                disabled={!!place.blocked}
                aria-describedby={place.blocked ? `${id}-place-blocked` : undefined}
                onClick={place.onPlace}
              >
                Place on the board
              </button>
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
            {place.blocked && (
              <span id={`${id}-place-blocked`} className="assets-hint">
                {place.blocked}
              </span>
            )}
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
                <ImageTile
                  key={v.asset.id}
                  image={v}
                  caption={caption(v)}
                  selected={current?.asset.id === v.asset.id}
                  onSelect={() => onSelect(v.asset.id)}
                  size={sizes[v.asset.id]}
                  onMeasure={onMeasure}
                  onRetry={onRetry}
                  onRemove={() => onChange((d) => removeImage(d, v.asset.id))}
                />
              ))}
              <AddTile label="Add view" onClick={add} />
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
      {children}
    </section>
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
