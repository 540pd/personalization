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
import { useBrand } from "@/store/brand.store";
import { listen } from "@/lib/dom/listen";
import { useToast } from "@/components/Toast/useToast";
import {
  deletePendingUploads,
  fetchBrandAssets,
  saveBrandAssets,
  updateAssetInfo,
  uploadPageAsset,
} from "@/api/brandAssets.api";
import {
  LOGO_TYPES_ACCEPTED,
  PRODUCT_IMAGE_TYPES_ACCEPTED,
  addUploading,
  changedImages,
  draftFrom,
  isDirty,
  isDuplicate,
  isUploading,
  imagesOf,
  recordOf,
  replaceImage,
  saveProblems,
  uploadFailed,
  uploadRetried,
  uploaded,
  type AssetsDraft,
  type ImageKind,
} from "../../assets/assetsDraft";
import LibraryPage from "../Library/LibraryPage";
import { DiscardChanges } from "../Library/LibraryDialog";
import ProductSection from "./ProductSection";
import BrandSection from "./BrandSection";
import BrandColours from "./BrandColours";
import LogoGroup from "./LogoGroup";
import type { LogoReading } from "../../assets/logoAnalysis";
import CreativeGroup, { type CreativeKind } from "./CreativeGroup";
import type { ImageSize } from "./AssetTiles";
import "./Assets.scss";

export default function AssetsPage() {
  const shown = useSection((s) => s.section === "assets");
  return shown ? <Page /> : null;
}

type Load = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready" };
type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "failed"; message: string } | { kind: "conflict" };

/** What each kind of image is called in a message about it. */
const NOUNS: Record<ImageKind, string> = {
  productImage: "product images",
  adaptFrom: "creatives to adapt from",
  styleExample: "style examples",
  logo: "logos",
};
const NOTHING_SELECTED: Record<ImageKind, string | null> = { productImage: null, adaptFrom: null, styleExample: null, logo: null };
const LOGO_NOT_PNG = "The logo must be a PNG. Export it with a transparent background and try again.";

/** Why `file` can't be added as `kind`, or null. */
function wrongType(file: File, kind: ImageKind): string | null {
  if (kind === "logo") return LOGO_TYPES_ACCEPTED.includes(file.type) ? null : LOGO_NOT_PNG;
  return PRODUCT_IMAGE_TYPES_ACCEPTED.includes(file.type) ? null : `${file.name}: ${NOUNS[kind]} must be PNG or JPG.`;
}

function Page() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [saved, setSaved] = useState<AssetsDraft | null>(null);
  const [draft, setDraft] = useState<AssetsDraft | null>(null);
  const [revision, setRevision] = useState(0);
  // Set by the first Save with something missing: from then on the missing
  // parts are marked as they stay missing.
  const [tried, setTried] = useState(false);
  // What the last add refused, shown in the group it was for.
  const [addError, setAddError] = useState<{ kind: ImageKind; message: string } | null>(null);
  // The item whose details are open, in each group.
  const [selected, setSelected] = useState(NOTHING_SELECTED);
  const [sizes, setSizes] = useState<Record<string, ImageSize>>({});
  // What each logo's pixels say: transparency and colours (#417).
  const [readings, setReadings] = useState<Record<string, LogoReading>>({});
  // Whether the Campaign Brief needs a logo (#409), as it is in this session.
  const logoRequired = useBrand((s) => s.brand.campaign.mandatory.logo);
  // Each upload's file and kind, for Retry, and each image's content hash, to
  // spot a duplicate (#415). By id: a temporary one until the upload lands.
  const files = useRef(new Map<string, { file: File; kind: ImageKind }>());
  const hashes = useRef(new Map<string, string>());
  // The local copy each upload shows meanwhile, released once it lands.
  const previews = useRef(new Map<string, string>());
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

  // The latest draft, for checks made between awaits.
  const latest = useRef(draft);
  latest.current = draft;

  const send = async (tempId: string) => {
    const pending = files.current.get(tempId);
    if (!pending) return;
    try {
      const asset = await uploadPageAsset(pending.file, pending.kind);
      files.current.delete(tempId);
      const preview = previews.current.get(tempId);
      previews.current.delete(tempId);
      const hash = hashes.current.get(tempId);
      if (hash) hashes.current.set(asset.id, hash);
      setSizes((s) => (s[tempId] ? { ...s, [asset.id]: s[tempId] } : s));
      setReadings((r) => (r[tempId] ? { ...r, [asset.id]: r[tempId] } : r));
      setSelected((sel) => (sel[pending.kind] === tempId ? { ...sel, [pending.kind]: asset.id } : sel));
      edit((d) => uploaded(d, tempId, asset));
      if (preview) setTimeout(() => URL.revokeObjectURL(preview), 1000);
    } catch (e) {
      edit((d) => uploadFailed(d, tempId, e instanceof Error ? e.message : "Couldn't upload it."));
    }
  };

  /** Click, drop or paste: each file shows at once and uploads in turn. */
  const addFiles = async (picked: File[], kind: ImageKind) => {
    setAddError(null);
    const hadMaster = !!latest.current?.masterId;
    const problems: string[] = [];
    const added: string[] = [];
    for (const file of picked) {
      const wrong = wrongType(file, kind);
      if (wrong) {
        if (!problems.includes(wrong)) problems.push(wrong);
        continue;
      }
      const hash = await contentHash(file);
      const now = latest.current;
      if (now && (isDuplicate(now, file, hash, hashes.current, kind) || added.some((id) => hashes.current.get(id) === hash))) {
        problems.push(`${file.name}: this image is already here.`);
        continue;
      }
      const tempId = `tmp-${crypto.randomUUID()}`;
      files.current.set(tempId, { file, kind });
      hashes.current.set(tempId, hash);
      added.push(tempId);
      const preview = URL.createObjectURL(file);
      previews.current.set(tempId, preview);
      edit((d) => addUploading(d, tempId, file, preview, kind));
    }
    if (problems.length) setAddError({ kind, message: problems.join(" ") });
    // The first new item opens its details. For product images, with no
    // master yet the first file became it, so that is the second.
    const first = kind !== "productImage" || hadMaster ? added[0] : added[1];
    if (first) setSelected((sel) => ({ ...sel, [kind]: first }));
    for (const id of added) await send(id);
  };

  const measure = (id: string, size: ImageSize) => setSizes((s) => ({ ...s, [id]: size }));

  /** A new file in an image's place (#417: Replace on a logo), its details kept. */
  const replace = async (id: string, file: File) => {
    const kind = latest.current?.images.find((i) => i.asset.id === id)?.asset.kind;
    if (!kind || kind === "reference") return;
    setAddError(null);
    const wrong = wrongType(file, kind);
    if (wrong) {
      setAddError({ kind, message: wrong });
      return;
    }
    const hash = await contentHash(file);
    const now = latest.current;
    if (now && isDuplicate(now, file, hash, hashes.current, kind)) {
      setAddError({ kind, message: `${file.name}: this image is already here.` });
      return;
    }
    const tempId = `tmp-${crypto.randomUUID()}`;
    files.current.set(tempId, { file, kind });
    hashes.current.set(tempId, hash);
    const preview = URL.createObjectURL(file);
    previews.current.set(tempId, preview);
    edit((d) => replaceImage(d, id, tempId, file, preview));
    await send(tempId);
  };

  const retry = (tempId: string) => {
    edit((d) => uploadRetried(d, tempId));
    void send(tempId);
  };

  // Paste an image from the clipboard (#415). Images only: pasted text is
  // the field's own business. It joins the group that has focus (#416), else
  // the product images.
  useEffect(() => {
    return listen(window, "paste", (e) => {
      const pasted = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!pasted.length) return;
      e.preventDefault();
      const group = document.activeElement?.closest<HTMLElement>("[data-asset-kind]")?.dataset.assetKind;
      void addFiles(pasted, group === "adaptFrom" || group === "styleExample" || group === "logo" ? group : "productImage");
    });
  });

  const creativeGroup = (kind: CreativeKind) => (
    <CreativeGroup
      kind={kind}
      draft={draft!}
      onChange={edit}
      onAddFiles={(picked) => void addFiles(picked, kind)}
      onRetry={retry}
      selected={selected[kind]}
      onSelect={(id) => setSelected((sel) => ({ ...sel, [kind]: id }))}
      sizes={sizes}
      onMeasure={measure}
      addError={addError?.kind === kind ? addError.message : null}
    />
  );

  const onSave = async () => {
    if (!draft) return;
    if (saveProblems(draft, { logoRequired }).message) {
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
    setAddError(null);
    setSaveState({ kind: "idle" });
    files.current.clear();
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

  const problems = draft ? saveProblems(draft, { logoRequired }) : null;
  // Suggested from the primary (first) logo.
  const primaryLogo = draft ? imagesOf(draft, "logo")[0] : undefined;
  const suggestions = (primaryLogo && readings[primaryLogo.asset.id]?.colours) || [];
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
            onAddFiles={(picked) => void addFiles(picked, "productImage")}
            onRetry={retry}
            selected={selected.productImage}
            onSelect={(id) => setSelected((sel) => ({ ...sel, productImage: id }))}
            sizes={sizes}
            onMeasure={measure}
            addError={addError?.kind === "productImage" ? addError.message : null}
            missingMaster={tried && !!problems?.missingMaster}
            missingName={tried && !!problems?.missingName}
          >
            {creativeGroup("adaptFrom")}
          </ProductSection>
          <BrandSection>
            <LogoGroup
              draft={draft}
              onChange={edit}
              onAddFiles={(picked) => void addFiles(picked, "logo")}
              onReplace={(id, file) => void replace(id, file)}
              onRetry={retry}
              readings={readings}
              onRead={(id, reading) => setReadings((r) => ({ ...r, [id]: reading }))}
              required={logoRequired}
              missing={tried && !!problems?.missingLogo}
              addError={addError?.kind === "logo" ? addError.message : null}
            />
            <BrandColours
              colours={draft.colours}
              onChange={(key, value) => edit((d) => ({ ...d, colours: { ...d.colours, [key]: value } }))}
              suggestions={suggestions}
              flagged={tried ? (problems?.badColours ?? []) : []}
            />
            {creativeGroup("styleExample")}
          </BrandSection>

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
            <button
              type="button"
              className="assets-primary"
              onClick={() => void onSave()}
              disabled={!dirty || saveState.kind === "saving" || isUploading(draft)}
              title={isUploading(draft) ? "Wait for the uploads to finish" : undefined}
            >
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

/** A file's SHA-256, to tell the same image added twice. */
async function contentHash(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
