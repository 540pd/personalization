"use client";

// The Assets page's Save and Cancel (#414), pinned to the bottom of the page
// while it scrolls, as on Brand.

import type { SaveState } from "./useAssetsDraft";

export default function AssetsSaveBar({
  dirty,
  saveState,
  uploading,
  onSave,
  onCancel,
}: {
  dirty: boolean;
  saveState: SaveState;
  /** Some upload hasn't landed yet: Save waits for it. */
  uploading: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="assets-save-bar" role="region" aria-label="Save assets">
      {saveState.kind === "failed" ? (
        <span className="assets-save-error" role="alert">
          {saveState.message}
        </span>
      ) : (
        dirty && (
          <span className="assets-save-state">
            <span className="assets-save-dot" aria-hidden />
            Unsaved changes
          </span>
        )
      )}
      <button type="button" className="assets-pill" onClick={onCancel} disabled={!dirty || saveState.kind === "saving"}>
        Cancel
      </button>
      <button
        type="button"
        className="assets-primary"
        onClick={onSave}
        disabled={!dirty || saveState.kind === "saving" || uploading}
        title={uploading ? "Wait for the uploads to finish" : undefined}
      >
        {saveState.kind === "saving" ? "Saving…" : "Save assets"}
      </button>
    </div>
  );
}
