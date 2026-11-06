"use client";

// An image's Description on the Assets page, with Describe it (#448): the
// text model writes a line about the stored image, into the draft like a
// typed one, so Save keeps it and Cancel takes it back. One component for
// product images, creatives, logos and references, so it behaves the same.

import { useState } from "react";
import { describeAsset } from "@/api/brandAssets.api";
import type { DraftImage } from "../../assets/assetsDraft";

export default function DescriptionField({
  id,
  image,
  labelClassName,
  placeholder,
  onChange,
}: {
  id: string;
  image: DraftImage;
  /** The label's size where the field sits: assets-label or assets-label-sm. */
  labelClassName: string;
  placeholder: string;
  onChange: (description: string) => void;
}) {
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  const describe = async () => {
    setWorking(true);
    setFailed(false);
    try {
      onChange(await describeAsset(image.asset.id));
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="assets-field">
      <div className="assets-field-head">
        <label htmlFor={id} className={labelClassName}>
          Description
        </label>
        <button
          type="button"
          className="assets-describe"
          // Uploading or failed: there is no stored image to read yet.
          disabled={working || !!image.upload}
          aria-busy={working}
          onClick={describe}
        >
          {working ? "Describing…" : "Describe it"}
        </button>
      </div>
      <textarea
        id={id}
        className="assets-input assets-textarea"
        rows={2}
        placeholder={placeholder}
        value={image.description}
        aria-describedby={failed ? `${id}-failed` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {failed && (
        <span id={`${id}-failed`} className="assets-field-error" role="alert">
          Couldn&apos;t describe it. Try again.
        </span>
      )}
    </div>
  );
}
