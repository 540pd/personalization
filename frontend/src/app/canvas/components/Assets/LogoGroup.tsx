"use client";

// The logo, first in section 2 of the Assets page (#417). Each logo is shown
// on a light and a dark background side by side, with its details beside it,
// and warned about when it has no transparency. PNG only (#412). Whether the
// Campaign Brief needs one (#409) is said in the hint, and Save asks for it.

import { useId } from "react";
import { pickFile } from "@/lib/dom/pickFile";
import {
  LOGO_TYPES,
  LOGO_TYPES_ACCEPTED,
  LOGO_USES,
  editImage,
  imagesOf,
  removeImage,
  type AssetsDraft,
  type DraftImage,
} from "../../assets/assetsDraft";
import DescriptionField from "./DescriptionField";
import { readLogo, type LogoReading } from "../../assets/logoAnalysis";
import { UploadOverlay, useDropZone } from "./AssetTiles";

type Edit = (update: (d: AssetsDraft) => AssetsDraft) => void;

export default function LogoGroup({
  draft,
  onChange,
  onAddFiles,
  onReplace,
  onRetry,
  readings,
  onRead,
  required,
  missing,
  addError,
}: {
  draft: AssetsDraft;
  onChange: Edit;
  onAddFiles: (files: File[]) => void;
  onReplace: (id: string, file: File) => void;
  onRetry: (id: string) => void;
  /** What each logo's pixels say, once it has loaded. */
  readings: Record<string, LogoReading>;
  onRead: (id: string, reading: LogoReading) => void;
  /** Whether the Campaign Brief marks the logo mandatory. */
  required: boolean;
  /** Save was tried without the logo the brief needs. */
  missing: boolean;
  addError: string | null;
}) {
  const id = useId();
  const logos = imagesOf(draft, "logo");
  const drop = useDropZone(onAddFiles);
  const add = () => pickFile(LOGO_TYPES_ACCEPTED.join(","), (file) => onAddFiles([file]));

  return (
    <div
      className={drop.active ? "assets-group is-dropping" : "assets-group"}
      role="group"
      aria-labelledby={`${id}-title`}
      data-asset-kind="logo"
      id="assets-logo"
      {...drop.handlers}
    >
      <div>
        <h3 id={`${id}-title`} className="assets-label">
          Logo
        </h3>
        <p className="assets-hint">
          PNG with a transparent background.{" "}
          {required ? (
            <strong className="assets-logo-rule">Required: Logo is mandatory in the Campaign Brief.</strong>
          ) : (
            "Optional: the Campaign Brief does not require it."
          )}
        </p>
      </div>

      {logos.length === 0 ? (
        <div className={missing ? "assets-logo-empty is-missing" : "assets-logo-empty"}>
          <div className="assets-logo-empty-text">
            <strong>No logo added.</strong>
            <span className="assets-muted">
              Add your primary logo if branding is required for this campaign. Or drop or paste it here.
            </span>
          </div>
          <button type="button" className="assets-primary" onClick={add}>
            Upload logo
          </button>
        </div>
      ) : (
        <>
          {logos.map((logo) => (
            <Logo
              key={logo.asset.id}
              logo={logo}
              reading={readings[logo.asset.id]}
              onRead={onRead}
              onChange={onChange}
              onReplace={onReplace}
              onRetry={onRetry}
            />
          ))}
          <button type="button" className="assets-pill assets-alternate" onClick={add}>
            + Alternate logo
          </button>
        </>
      )}
      {addError && (
        <span className="assets-field-error" role="alert">
          {addError}
        </span>
      )}
    </div>
  );
}

function Logo({
  logo,
  reading,
  onRead,
  onChange,
  onReplace,
  onRetry,
}: {
  logo: DraftImage;
  reading: LogoReading | undefined;
  onRead: (id: string, reading: LogoReading) => void;
  onChange: Edit;
  onReplace: (id: string, file: File) => void;
  onRetry: (id: string) => void;
}) {
  const id = useId();
  const remove = () => onChange((d) => removeImage(d, logo.asset.id));
  const set = (details: Record<string, string>) => onChange((d) => editImage(d, logo.asset.id, { details }));
  const label = logo.details.logoType || "Logo";

  return (
    <div className="assets-logo" role="group" aria-label={`${label}: ${logo.asset.name}`}>
      <div className="assets-logo-preview">
        <div className="assets-logo-panes">
          <div className="assets-logo-pane is-light">
            {/* eslint-disable-next-line @next/next/no-img-element -- an asset behind the signed-in proxy (or a local copy), which next/image cannot fetch */}
            <img
              src={logo.asset.url}
              alt={logo.description || `${label} on light: ${logo.asset.name}`}
              onLoad={(e) => {
                const read = readLogo(e.currentTarget);
                if (read) onRead(logo.asset.id, read);
              }}
            />
            <span>On light</span>
          </div>
          <div className="assets-logo-pane is-dark">
            {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
            <img src={logo.asset.url} alt="" />
            <span>On dark</span>
          </div>
          <UploadOverlay image={logo} onRetry={onRetry} onRemove={remove} />
        </div>
        <div className="assets-details-actions">
          <button
            type="button"
            className="assets-pill"
            disabled={logo.upload?.state === "uploading"}
            onClick={() => pickFile(LOGO_TYPES_ACCEPTED.join(","), (file) => onReplace(logo.asset.id, file))}
          >
            Replace
          </button>
          <button type="button" className="assets-danger" onClick={remove}>
            Remove
          </button>
        </div>
      </div>

      <div className="assets-image-fields">
        {reading && !reading.transparent && (
          <div className="assets-warning" role="status">
            <strong>Solid background.</strong> This logo isn&apos;t transparent, so it may show as a box on coloured creatives.
          </div>
        )}
        <DescriptionField
          id={`${id}-desc`}
          image={logo}
          labelClassName="assets-label-sm"
          placeholder="Black wordmark, for light backgrounds"
          onChange={(description) => onChange((d) => editImage(d, logo.asset.id, { description }))}
        />
        <div className="assets-row2">
          <div className="assets-field">
            <label htmlFor={`${id}-type`} className="assets-label-sm">
              Logo type
            </label>
            <select id={`${id}-type`} className="assets-input" value={logo.details.logoType ?? ""} onChange={(e) => set({ logoType: e.target.value })}>
              <option value="">Choose a type</option>
              {LOGO_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="assets-field">
            <label htmlFor={`${id}-use`} className="assets-label-sm">
              Use it
            </label>
            <select id={`${id}-use`} className="assets-input" value={logo.details.usage ?? ""} onChange={(e) => set({ usage: e.target.value })}>
              <option value="">Choose when</option>
              {LOGO_USES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
