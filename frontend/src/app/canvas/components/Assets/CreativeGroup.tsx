"use client";

// A group of creatives on the Assets page (#416): "Adapt from", last in
// section 1, and "Style examples", in section 2. Tiles with "+ Add", and the
// selected one's details inline below, as product views have (#414). Each
// item has a Name (its file name to start with), a type or two, and a
// description.

import { useId } from "react";
import { pickFiles } from "@/lib/dom/pickFile";
import {
  ADAPT_CREATIVE_TYPES,
  ASPECT_RATIOS,
  PRODUCT_IMAGE_TYPES_ACCEPTED,
  STYLE_EXAMPLE_TYPES,
  editImage,
  imagesOf,
  removeImage,
  type AssetsDraft,
  type DraftImage,
} from "../../assets/assetsDraft";
import { AddTile, ImageTile, LowResWarning, useDropZone, type ImageSize } from "./AssetTiles";

type Edit = (update: (d: AssetsDraft) => AssetsDraft) => void;
export type CreativeKind = "adaptFrom" | "styleExample";

interface Group {
  title: string;
  lead: string;
  add: string;
  /** The details box's accessible name. */
  details: string;
  namePlaceholder: string;
  description: string;
  /** Each item's choices, by detail key. */
  fields: { key: string; label: string; options: readonly string[] }[];
}

const GROUPS: Record<CreativeKind, Group> = {
  adaptFrom: {
    title: "Adapt from",
    lead: "An existing hero or campaign creative to start from: Content Studio keeps its layout and adapts it.",
    add: "Add existing creative",
    details: "Creative details",
    namePlaceholder: "Spring key visual",
    description: "Runner crossing a bridge at dawn, headline top left",
    fields: [
      { key: "creativeType", label: "Creative type", options: ADAPT_CREATIVE_TYPES },
      { key: "aspectRatio", label: "Aspect ratio", options: ASPECT_RATIOS },
    ],
  },
  styleExample: {
    title: "Style examples",
    lead: "Approved work that shows how the brand usually looks: Content Studio matches the style, not the layout.",
    add: "Add example",
    details: "Example details",
    namePlaceholder: "Spring social post",
    description: "Bright flat colour, product centred, short headline",
    fields: [{ key: "exampleType", label: "Example type", options: STYLE_EXAMPLE_TYPES }],
  },
};

/** Names stay short: the backend takes up to 200 characters (#412). */
const MAX_NAME = 200;

export default function CreativeGroup({
  kind,
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
  kind: CreativeKind;
  draft: AssetsDraft;
  onChange: Edit;
  onAddFiles: (files: File[]) => void;
  onRetry: (id: string) => void;
  /** The item whose details are open; the first one when it is null. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  sizes: Record<string, ImageSize>;
  onMeasure: (id: string, size: ImageSize) => void;
  addError: string | null;
}) {
  const id = useId();
  const group = GROUPS[kind];
  const items = imagesOf(draft, kind);
  const current = items.find((i) => i.asset.id === selected) ?? items[0] ?? null;
  const drop = useDropZone(onAddFiles);
  const add = () => pickFiles(PRODUCT_IMAGE_TYPES_ACCEPTED.join(","), onAddFiles);

  return (
    <div
      className={drop.active ? "assets-group is-dropping" : "assets-group"}
      role="group"
      aria-labelledby={`${id}-title`}
      data-asset-kind={kind}
      {...drop.handlers}
    >
      <div>
        <h3 id={`${id}-title`} className="assets-label">
          {group.title} <span className="assets-muted">(optional)</span>
        </h3>
        <p className="assets-hint">{group.lead}</p>
      </div>
      <div className="assets-grid">
        {items.map((item) => (
          <ImageTile
            key={item.asset.id}
            image={item}
            caption={caption(item)}
            selected={current?.asset.id === item.asset.id}
            onSelect={() => onSelect(item.asset.id)}
            size={sizes[item.asset.id]}
            onMeasure={onMeasure}
            onRetry={onRetry}
            onRemove={() => onChange((d) => removeImage(d, item.asset.id))}
          />
        ))}
        <AddTile label={group.add} onClick={add} />
      </div>
      {addError && (
        <span className="assets-field-error" role="alert">
          {addError}
        </span>
      )}

      {current && (
        <div className="assets-details" role="group" aria-label={group.details}>
          <LowResWarning size={sizes[current.asset.id]} />
          <CreativeDetails image={current} group={group} onChange={onChange} />
          <div className="assets-details-actions">
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
  );
}

/** What an item's tile says: its name, else its file. */
function caption(image: DraftImage): string {
  return image.details.name || image.asset.name || "Creative";
}

function CreativeDetails({ image, group, onChange }: { image: DraftImage; group: Group; onChange: Edit }) {
  const id = useId();
  const set = (details: Record<string, string>) => onChange((d) => editImage(d, image.asset.id, { details }));
  return (
    <div className="assets-image-fields">
      <div className="assets-row3">
        <div className="assets-field">
          <label htmlFor={`${id}-name`} className="assets-label-sm">
            Name
          </label>
          <input
            id={`${id}-name`}
            className="assets-input"
            placeholder={group.namePlaceholder}
            maxLength={MAX_NAME}
            value={image.details.name ?? ""}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        {group.fields.map((field) => (
          <div key={field.key} className="assets-field">
            <label htmlFor={`${id}-${field.key}`} className="assets-label-sm">
              {field.label}
            </label>
            <select
              id={`${id}-${field.key}`}
              className="assets-input"
              value={image.details[field.key] ?? ""}
              onChange={(e) => set({ [field.key]: e.target.value })}
            >
              <option value="">Choose one</option>
              {field.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="assets-field">
        <label htmlFor={`${id}-desc`} className="assets-label-sm">
          Description
        </label>
        <textarea
          id={`${id}-desc`}
          className="assets-input assets-textarea"
          rows={2}
          placeholder={group.description}
          value={image.description}
          onChange={(e) => {
            const description = e.target.value;
            onChange((d) => editImage(d, image.asset.id, { description }));
          }}
        />
      </div>
    </div>
  );
}
