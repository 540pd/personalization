"use client";

// Section 3 of the Assets page (#418): creative references, a library of
// backgrounds, scenes and mood boards kept here once and chosen per campaign
// later. Each says how it is used (as is, or for inspiration) and whether
// every campaign uses it. Tiles filtered by type, the selected one's details
// inline below.

import { useId, useState } from "react";
import { pickFiles } from "@/lib/dom/pickFile";
import {
  PRODUCT_IMAGE_TYPES_ACCEPTED,
  REFERENCE_TYPES,
  editImage,
  imagesOf,
  removeImage,
  setReferenceType,
  type AssetsDraft,
  type DraftImage,
  type ReferenceScope,
  type ReferenceUse,
} from "../../assets/assetsDraft";
import DescriptionField from "./DescriptionField";
import { AddTile, ImageTile, LowResWarning, measured, useDropZone, type ImageSize } from "./AssetTiles";

type Edit = (update: (d: AssetsDraft) => AssetsDraft) => void;

const USES: { value: ReferenceUse; label: string; help: string }[] = [
  { value: "asIs", label: "As is", help: "Use this image itself, e.g. place the product on this background." },
  { value: "inspiration", label: "Inspiration only", help: "Take its mood, light or setting, never the image itself." },
];

const SCOPES: { value: ReferenceScope; label: string; help: string }[] = [
  { value: "always", label: "Always", help: "Every campaign uses it: a signature look." },
  {
    value: "picked",
    label: "When a campaign picks it",
    help: "Chosen in the Campaign Brief on the Brand page.",
  },
];

export default function ReferencesSection({
  draft,
  onChange,
  onAddFiles,
  onRetry,
  selected,
  onSelect,
  sizes,
  onMeasure,
  addError,
}: {
  draft: AssetsDraft;
  onChange: Edit;
  onAddFiles: (files: File[]) => void;
  onRetry: (id: string) => void;
  /** The reference whose details are open; the first shown when it is null. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  sizes: Record<string, ImageSize>;
  onMeasure: (id: string, size: ImageSize) => void;
  addError: string | null;
}) {
  const id = useId();
  const refs = imagesOf(draft, "reference");
  // The types in use, in the order the type list gives them.
  const types = REFERENCE_TYPES.filter((t) => refs.some((r) => r.details.referenceType === t));
  const [chosen, setFilter] = useState<string | null>(null);
  // A filter whose last reference changed type, or went, shows everything again.
  const filter = chosen && types.includes(chosen as (typeof types)[number]) ? chosen : null;
  const shown = filter ? refs.filter((r) => r.details.referenceType === filter) : refs;
  const current = shown.find((r) => r.asset.id === selected) ?? shown[0] ?? null;
  const drop = useDropZone(onAddFiles);
  const add = () => pickFiles(PRODUCT_IMAGE_TYPES_ACCEPTED.join(","), onAddFiles);

  return (
    <section className="assets-section" aria-labelledby={`${id}-title`} data-asset-kind="reference">
      <div>
        <div className="assets-section-head">
          <h2 id={`${id}-title`} className="assets-section-title">
            3 · Creative references
          </h2>
          <span className="assets-tag">Optional</span>
        </div>
        <p className="assets-lead">
          Backgrounds, scenes and mood boards that guide how creatives look. Keep them here once; each campaign picks the ones it
          needs.
        </p>
      </div>

      {types.length > 0 && (
        <div className="assets-filters" role="group" aria-label="Show references">
          {[null, ...types].map((t) => (
            <button
              key={t ?? "all"}
              type="button"
              className="assets-filter"
              aria-pressed={filter === t}
              onClick={() => setFilter(t)}
            >
              {t ?? "All"}
            </button>
          ))}
        </div>
      )}

      <div className={drop.active ? "assets-references is-dropping" : "assets-references"} {...drop.handlers}>
        <div className="assets-grid">
          {shown.map((r) => (
            <ImageTile
              key={r.asset.id}
              image={r}
              caption={r.description || r.asset.name || "Reference"}
              selected={current?.asset.id === r.asset.id}
              onSelect={() => onSelect(r.asset.id)}
              size={sizes[r.asset.id]}
              onMeasure={onMeasure}
              onRetry={onRetry}
              onRemove={() => onChange((d) => removeImage(d, r.asset.id))}
              badges={
                <>
                  {r.details.referenceType && <span className="assets-chip-tag">{r.details.referenceType}</span>}
                  {r.details.scope === "always" && <span className="assets-chip-tag is-always">Always</span>}
                </>
              }
            />
          ))}
          <AddTile label="Add reference" onClick={add} />
        </div>
      </div>
      {addError && (
        <span className="assets-field-error" role="alert">
          {addError}
        </span>
      )}

      {current && (
        <ReferenceDetails
          key={current.asset.id}
          reference={current}
          size={sizes[current.asset.id]}
          onMeasure={onMeasure}
          onChange={onChange}
          onRemove={() => {
            onChange((d) => removeImage(d, current.asset.id));
            onSelect(null);
          }}
        />
      )}

      <p className="assets-hint">
        Inspiration references guide the look; Content Studio won&apos;t copy them. Use &quot;As is&quot; only for images you own or
        have licensed.
      </p>
    </section>
  );
}

function ReferenceDetails({
  reference,
  size,
  onMeasure,
  onChange,
  onRemove,
}: {
  reference: DraftImage;
  size: ImageSize | undefined;
  onMeasure: (id: string, size: ImageSize) => void;
  onChange: Edit;
  onRemove: () => void;
}) {
  const id = useId();
  const refId = reference.asset.id;
  const set = (details: Record<string, string>) => onChange((d) => editImage(d, refId, { details }));

  return (
    <div className="assets-details assets-reference" role="group" aria-label="Reference details">
      <div className="assets-reference-preview">
        {/* eslint-disable-next-line @next/next/no-img-element -- an asset behind the signed-in proxy (or a local copy), which next/image cannot fetch */}
        <img src={reference.asset.url} alt={reference.description || `Reference: ${reference.asset.name}`} onLoad={measured(reference, onMeasure)} />
        <button type="button" className="assets-danger" onClick={onRemove}>
          Remove reference
        </button>
      </div>

      <div className="assets-image-fields">
        <LowResWarning size={size} />
        <div className="assets-reference-row">
          <div className="assets-field">
            <label htmlFor={`${id}-type`} className="assets-label-sm">
              Reference type
            </label>
            <select
              id={`${id}-type`}
              className="assets-input"
              value={reference.details.referenceType ?? ""}
              onChange={(e) => {
                const type = e.target.value;
                onChange((d) => setReferenceType(d, refId, type));
              }}
            >
              <option value="">Choose a type</option>
              {REFERENCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <Choices legend="How to use it" name={`${id}-use`} options={USES} value={reference.details.use} onPick={(use) => set({ use })} />
        </div>
        <DescriptionField
          id={`${id}-desc`}
          image={reference}
          labelClassName="assets-label-sm"
          placeholder="Wet city street at dusk, neon reflections"
          onChange={(description) => onChange((d) => editImage(d, refId, { description }))}
        />
        <Choices legend="Use in campaigns" name={`${id}-scope`} options={SCOPES} value={reference.details.scope} onPick={(scope) => set({ scope })} />
      </div>
    </div>
  );
}

/** Two or more explained choices, as radio cards. */
function Choices<T extends string>({
  legend,
  name,
  options,
  value,
  onPick,
}: {
  legend: string;
  name: string;
  options: { value: T; label: string; help: string }[];
  value: string | undefined;
  onPick: (value: T) => void;
}) {
  return (
    <fieldset className="assets-choices">
      <legend className="assets-label-sm">{legend}</legend>
      <div className="assets-choices-row">
        {options.map((o) => (
          <label key={o.value} className={value === o.value ? "assets-choice is-checked" : "assets-choice"}>
            <input type="radio" name={name} checked={value === o.value} onChange={() => onPick(o.value)} />
            <span className="assets-choice-text">
              <span className="assets-choice-label">{o.label}</span>
              <span className="assets-choice-help">{o.help}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
