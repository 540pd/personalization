"use client";

// Luma reference: ASSET-01. The Assets page (#414): the product and brand
// assets generation works from, saved with the account (#412, #413).
// Design: the "Assets Page" canvas linked from the issue.
//
// Edits go into a draft and reach the backend only on Save assets. Uploads
// are stored at once (they have to be, to show), so Cancel and a discarded
// leave clear the ones no save attached, and so does opening the page, for
// any a closed tab left behind.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSection, setLeaveGuard } from "@/store/section.store";
import { useToast } from "@/components/Toast/useToast";
import {
  deletePendingUploads,
  fetchBrandAssets,
  saveBrandAssets,
  updateAssetInfo,
  uploadPageAsset,
} from "@/api/brandAssets.api";
import {
  PRODUCT_IMAGE_TYPES_ACCEPTED,
  addImage,
  changedImages,
  draftFrom,
  isDirty,
  recordOf,
  saveProblems,
  type AssetsDraft,
} from "../../assets/assetsDraft";
import LibraryPage from "../Library/LibraryPage";
import { DiscardChanges } from "../Library/LibraryDialog";
import ProductSection from "./ProductSection";
import "./Assets.scss";

export default function AssetsPage() {
  const shown = useSection((s) => s.section === "assets");
  return shown ? <Page /> : null;
}

type Load = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready" };
type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "failed"; message: string } | { kind: "conflict" };

function Page() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [saved, setSaved] = useState<AssetsDraft | null>(null);
  const [draft, setDraft] = useState<AssetsDraft | null>(null);
  const [revision, setRevision] = useState(0);
  // Set by the first Save with something missing: from then on the missing
  // parts are marked as they stay missing.
  const [tried, setTried] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  // The move a Discard would make, while the confirm is up.
  const [pending, setPending] = useState<(() => void) | null>(null);
  const beforeConfirm = useRef<HTMLElement | null>(null);
  const [toast, showToast] = useToast();

  // Only the newest load may fill the page: an older one landing late (a
  // second mount, a Retry) would overwrite what was typed since.
  const loads = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++loads.current;
    setLoad({ kind: "loading" });
    try {
      await deletePendingUploads();
      const view = await fetchBrandAssets();
      if (mine !== loads.current) return;
      const fresh = draftFrom(view);
      setSaved(fresh);
      setDraft(fresh);
      setRevision(view.revision);
      setTried(false);
      setSaveState({ kind: "idle" });
      setLoad({ kind: "ready" });
    } catch (e) {
      if (mine !== loads.current) return;
      setLoad({ kind: "error", message: e instanceof Error ? e.message : "Couldn't load your assets." });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dirty = !!draft && !!saved && isDirty(draft, saved);

  // Leaving with unsaved changes asks first, as Brand does (#219).
  useEffect(() => {
    if (!dirty) return;
    setLeaveGuard((proceed) => {
      beforeConfirm.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPending(() => proceed);
      return true;
    });
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);

  const edit = (update: (d: AssetsDraft) => AssetsDraft) => {
    setDraft((d) => (d ? update(d) : d));
    if (saveState.kind === "failed") setSaveState({ kind: "idle" });
  };

  const addFile = async (file: File) => {
    setUploadError(null);
    if (!PRODUCT_IMAGE_TYPES_ACCEPTED.includes(file.type)) {
      setUploadError("Product images must be PNG or JPG.");
      return;
    }
    setUploading(true);
    try {
      const asset = await uploadPageAsset(file, "productImage");
      edit((d) => addImage(d, asset));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Couldn't upload it.");
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    if (!draft) return;
    if (saveProblems(draft).message) {
      setTried(true);
      return;
    }
    setSaveState({ kind: "saving" });
    try {
      // Each image's details first, then the page that lists them.
      let next = draft;
      for (const image of changedImages(draft)) {
        const asset = await updateAssetInfo(image.asset.id, { description: image.description, details: image.details });
        next = { ...next, images: next.images.map((i) => (i.asset.id === asset.id ? { ...i, asset } : i)) };
      }
      const reply = await saveBrandAssets(revision, recordOf(next));
      if (!reply.ok) {
        setSaveState({ kind: "conflict" });
        return;
      }
      setRevision(reply.revision);
      setSaved(next);
      setDraft(next);
      setTried(false);
      setSaveState({ kind: "idle" });
      showToast("Assets saved");
    } catch (e) {
      setSaveState({ kind: "failed", message: e instanceof Error ? e.message : "Couldn't save the assets." });
    }
  };

  const onCancel = () => {
    setDraft(saved);
    setTried(false);
    setUploadError(null);
    setSaveState({ kind: "idle" });
    void deletePendingUploads();
  };

  const keepEditing = () => {
    setPending(null);
    requestAnimationFrame(() => beforeConfirm.current?.focus());
  };

  const discard = () => {
    const proceed = pending;
    setPending(null);
    setLeaveGuard(null);
    void deletePendingUploads();
    proceed?.();
  };

  const problems = draft ? saveProblems(draft) : null;
  const showProblems = tried && !!problems?.message;

  return (
    <LibraryPage
      title="Assets"
      subtitle="Add the core product and brand assets Content Studio needs to generate accurate, on-brand creatives."
    >
      {load.kind === "loading" && (
        <p className="assets-status" role="status">
          Loading your assets…
        </p>
      )}
      {load.kind === "error" && (
        <div className="assets-alert" role="alert">
          {load.message}
          <button type="button" className="assets-link" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}
      {load.kind === "ready" && draft && (
        <>
          {showProblems && (
            <div className="assets-alert" role="alert">
              {problems!.message}
            </div>
          )}
          {saveState.kind === "conflict" && (
            <div className="assets-alert" role="alert">
              The Assets page was saved somewhere else since you opened it.
              <button type="button" className="assets-link" onClick={() => void reload()}>
                Load the latest
              </button>
            </div>
          )}
          <ProductSection
            draft={draft}
            onChange={edit}
            onAddFile={(file) => void addFile(file)}
            uploading={uploading}
            uploadError={uploadError}
            missingMaster={tried && !!problems?.missingMaster}
            missingName={tried && !!problems?.missingName}
          />

          {/* Pinned to the bottom of the page while it scrolls, as on Brand. */}
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
            <button type="button" className="assets-primary" onClick={() => void onSave()} disabled={!dirty || saveState.kind === "saving"}>
              {saveState.kind === "saving" ? "Saving…" : "Save assets"}
            </button>
          </div>
        </>
      )}

      {pending && <DiscardChanges name="the assets" onKeepEditing={keepEditing} onDiscard={discard} />}
      {toast}
    </LibraryPage>
  );
}
