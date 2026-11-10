"use client";

// The Assets page's saved and edited versions (#414, #462). Edits go into a
// draft and reach the backend only on Save assets. Uploads are stored at once
// (they have to be, to show), so Cancel clears the ones no save attached, and
// so does loading the page, for any a closed tab left behind.

import { useCallback, useEffect, useRef, useState } from "react";
import { useBrand } from "@/store/brand.store";
import { deletePendingUploads, fetchBrandAssets, saveBrandAssets, updateAssetInfo } from "@/api/brandAssets.api";
import { changedImages, draftFrom, isDirty, recordOf, saveProblems, type AssetsDraft } from "../../assets/assetsDraft";

export type Load = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready" };
export type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "failed"; message: string } | { kind: "conflict" };
export type Edit = (update: (d: AssetsDraft) => AssetsDraft) => void;

export function useAssetsDraft() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [saved, setSaved] = useState<AssetsDraft | null>(null);
  const [draft, setDraft] = useState<AssetsDraft | null>(null);
  const [revision, setRevision] = useState(0);
  // Set by the first Save with something missing: from then on the missing
  // parts are marked as they stay missing.
  const [tried, setTried] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  // Whether the Campaign Brief needs a logo (#409), as it is in this session.
  const logoRequired = useBrand((s) => s.brand.campaign.mandatory.logo);

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

  // Stable, so an upload landing later edits through the same function. Any
  // edit clears a failed save's message.
  const edit = useCallback<Edit>((update) => {
    setDraft((d) => (d ? update(d) : d));
    setSaveState((s) => (s.kind === "failed" ? { kind: "idle" } : s));
  }, []);

  const dirty = !!draft && !!saved && isDirty(draft, saved);
  const problems = draft ? saveProblems(draft, { logoRequired }) : null;

  /** Saves the draft; true once the backend has it. */
  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    if (problems?.message) {
      setTried(true);
      return false;
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
        return false;
      }
      setRevision(reply.revision);
      setSaved(next);
      setDraft(next);
      setTried(false);
      setSaveState({ kind: "idle" });
      return true;
    } catch (e) {
      setSaveState({ kind: "failed", message: e instanceof Error ? e.message : "Couldn't save the assets." });
      return false;
    }
  };

  /** Back to what was saved, clearing the uploads no save attached. */
  const cancel = () => {
    setDraft(saved);
    setTried(false);
    setSaveState({ kind: "idle" });
    void deletePendingUploads();
  };

  return { load, draft, dirty, tried, saveState, problems, logoRequired, edit, reload, save, cancel };
}
