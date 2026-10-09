"use client";

import { useId, useRef } from "react";
import { X } from "lucide-react";
import type { ArtDirection, ReferenceImage } from "@/store/brand.store";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * One art-direction component: description, Disabled toggle and display-only
 * reference images.
 *
 * Disabling locks the fields but keeps what is in them, so switching a
 * component off for a while does not cost the client their wording.
 */
export default function ArtDirectionCard({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ArtDirection;
  /** An updater, not a value: image reads finish later, after other edits. */
  onChange: (update: (prev: ArtDirection) => ArtDirection) => void;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const { description, disabled, images } = value;

  const addImages = async (files: File[]) => {
    const added: ReferenceImage[] = await Promise.all(
      files
        .filter((f) => f.type.startsWith("image/"))
        .map(async (f) => ({ id: crypto.randomUUID(), name: f.name, src: await readAsDataUrl(f) })),
    );
    if (added.length) onChange((prev) => ({ ...prev, images: [...prev.images, ...added] }));
  };

  return (
    <section className={`brand-card${disabled ? " brand-card-disabled" : ""}`} aria-labelledby={`${id}-title`}>
      <div className="brand-card-head">
        <h3 id={`${id}-title`} className="brand-card-title">
          {label}
        </h3>
        <label className="brand-checkbox">
          <input
            type="checkbox"
            checked={disabled}
            onChange={(e) => {
              const checked = e.target.checked;
              onChange((prev) => ({ ...prev, disabled: checked }));
            }}
          />
          <span>Disabled</span>
        </label>
      </div>

      <textarea
        className="brand-textarea"
        aria-labelledby={`${id}-title`}
        placeholder={`Describe the ${label.toLowerCase()} for this brand...`}
        value={description}
        disabled={disabled}
        onChange={(e) => {
          const text = e.target.value;
          onChange((prev) => ({ ...prev, description: text }));
        }}
      />

      <div className="brand-refs-label">
        <span className="brand-refs-title">Reference images</span>
        <span className="brand-refs-note">(display only — not sent to model)</span>
      </div>

      {images.length > 0 && (
        <ul className="brand-thumbs">
          {images.map((img) => (
            <li key={img.id} className="brand-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimise */}
              <img src={img.src} alt={img.name} />
              <button
                type="button"
                className="brand-thumb-remove"
                aria-label={`Remove ${img.name}`}
                disabled={disabled}
                onClick={() => onChange((prev) => ({ ...prev, images: prev.images.filter((i) => i.id !== img.id) }))}
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="brand-pill"
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
      >
        + Add image
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void addImages(Array.from(e.target.files ?? []));
          // Cleared so picking the same file again still fires change.
          e.target.value = "";
        }}
      />
    </section>
  );
}
