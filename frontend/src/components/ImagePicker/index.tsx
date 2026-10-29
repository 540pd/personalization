"use client";

// Choose an image from the user's Assets or upload one (#408). An upload is
// stored as an asset too, so there is one library to pick from next time.
// Built for the Brand page's logo (#409); kept here so the Assets page and
// other image fields can use it.

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import { listImageAssets, uploadAsset, type AssetView } from "@/api/assets.api";
import { useDismiss } from "@/lib/dom/useDismiss";
import { pickFile } from "@/lib/dom/pickFile";
import "./ImagePicker.scss";

export interface PickedImage {
  id: string;
  url: string;
  /** What the control shows: the file name for a fresh upload, else its label. */
  name: string;
}

/**
 * How a listed asset is named. Assets have no file name -- an upload sends
 * only its bytes -- so they are told apart by where they came from and when.
 */
export function assetLabel(asset: AssetView): string {
  const when = new Date(asset.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${asset.source === "generated" ? "Generated" : "Uploaded"} · ${when}`;
}

type ListState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; assets: AssetView[] };

export default function ImagePicker({
  value,
  onChange,
  label,
}: {
  value: PickedImage | null;
  onChange: (image: PickedImage | null) => void;
  /** The popover's name, e.g. "Choose a logo". */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  const load = () => {
    setList({ kind: "loading" });
    listImageAssets().then(
      (assets) => setList({ kind: "ready", assets }),
      () => setList({ kind: "error" }),
    );
  };

  const close = (giveBackFocus = true) => {
    setOpen(false);
    setUploadError(null);
    refocus.current = giveBackFocus;
  };

  // Focus goes back once the control has re-rendered: a first pick swaps
  // Choose image for Change, and focusing the old button lost it.
  useEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    triggerRef.current?.focus();
  }, [open, value]);

  // Fresh each time it opens: an upload elsewhere may have added one.
  useEffect(() => {
    if (!open) return;
    load();
    popRef.current?.focus();
  }, [open]);

  // A press outside closes it and leaves focus where the press put it.
  useDismiss(open, [wrapRef], () => close(false));

  const choose = (image: PickedImage) => {
    onChange(image);
    close();
  };

  const upload = () => {
    setUploadError(null);
    pickFile("image/*", async (file) => {
      setUploading(true);
      try {
        const asset = await uploadAsset(file);
        choose({ id: asset.id, url: asset.url, name: file.name });
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Couldn't save it to your account");
      } finally {
        setUploading(false);
      }
    });
  };

  return (
    <div ref={wrapRef} className="image-picker">
      {value ? (
        <div className="image-picker-chosen">
          {/* eslint-disable-next-line @next/next/no-img-element -- an asset behind the signed-in proxy, which next/image cannot fetch */}
          <img className="image-picker-thumb" src={value.url} alt="" />
          <span className="image-picker-name">{value.name}</span>
          <button
            ref={triggerRef}
            type="button"
            className="image-picker-change"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            Change
          </button>
          <button type="button" className="image-picker-remove" aria-label="Remove image" onClick={() => onChange(null)}>
            <X size={14} aria-hidden />
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="image-picker-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <ImageIcon size={14} aria-hidden />
          Choose image
        </button>
      )}

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className="image-picker-popover"
          // Esc closes only this popover, not the page under it (#405), and
          // hands focus back to the control that opened it.
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
        >
          <div className="image-picker-heading">From Assets</div>
          {list.kind === "loading" && (
            <div className="image-picker-grid" aria-busy="true" aria-label="Loading your assets">
              {[0, 1, 2].map((i) => (
                <div key={i} className="image-picker-tile is-placeholder" />
              ))}
            </div>
          )}
          {list.kind === "error" && (
            <div className="image-picker-message" role="alert">
              Couldn&apos;t load your assets.
              <button type="button" className="image-picker-retry" onClick={load}>
                Retry
              </button>
            </div>
          )}
          {list.kind === "ready" && list.assets.length === 0 && (
            <div className="image-picker-message">No images in Assets yet.</div>
          )}
          {list.kind === "ready" && list.assets.length > 0 && (
            <div className="image-picker-grid">
              {list.assets.map((asset) => {
                const name = assetLabel(asset);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={asset.id === value?.id ? "image-picker-tile is-chosen" : "image-picker-tile"}
                    aria-pressed={asset.id === value?.id}
                    onClick={() => choose({ id: asset.id, url: asset.url, name })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- as above: behind the proxy */}
                    <img src={asset.url} alt="" loading="lazy" />
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="image-picker-divider" />
          <button type="button" className="image-picker-upload" onClick={upload} disabled={uploading} aria-busy={uploading}>
            <Upload size={14} aria-hidden />
            {uploading ? "Uploading…" : "Upload image"}
          </button>
          {uploadError ? (
            <span className="image-picker-error" role="alert">
              {uploadError}
            </span>
          ) : (
            <span className="image-picker-note">Uploads are added to Assets too.</span>
          )}
        </div>
      )}
    </div>
  );
}
