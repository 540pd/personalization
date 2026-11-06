"use client";

// GCOS reference: docs/sidebar/gcos_user_click_brand.png, _2.png, _3.png
// Spec: #72 (the fields), #219 (a page over the board, like Settings),
// #409 (the Campaign Brief in place of the Art-direction components).
// Brand Profile sits at the end, as in the mockup, and is locked until
// Analyze has a backend. When it does, it is meant to fill in the fields
// above it.

import { useEffect, useId, useRef, useState } from "react";
import { useSection, setLeaveGuard } from "@/store/section.store";
import { useBrand, type BrandSettings, type CampaignBrief as Brief } from "@/store/brand.store";
import { useToast } from "@/components/Toast/useToast";
import LibraryPage from "../Library/LibraryPage";
import { DiscardChanges } from "../Library/LibraryDialog";
import CampaignBrief from "./CampaignBrief";
import "./Brand.scss";

export default function BrandPage() {
  const shown = useSection((s) => s.section === "brand");
  // Always mounted, so the saved brand loads when the app opens (#454): the
  // Assets page's logo rule and the panels' Use brand line read it too.
  useEffect(() => {
    void useBrand.getState().load();
  }, []);
  return shown ? <Page /> : null;
}

/**
 * The page while the saved brand loads, or after it failed to: nothing is
 * editable until it is here, so an empty form can never be saved over it.
 * Once loaded, the editor is keyed by the load, so Load the latest after a
 * conflict starts it again from what was saved; its own Save does not.
 */
function Page() {
  const status = useBrand((s) => s.status);
  const loads = useBrand((s) => s.loads);
  if (status === "ready") return <Editor key={loads} />;
  return (
    <LibraryPage closable title="Brand" subtitle="What every generation knows about this client. Edits apply once you save.">
      {status === "failed" ? (
        <p className="brand-load-problem" role="alert">
          Couldn&apos;t load the brand.
          <button type="button" className="brief-link" onClick={() => void useBrand.getState().reload()}>
            Retry
          </button>
        </p>
      ) : (
        <p className="brief-muted">Loading the brand…</p>
      )}
    </LibraryPage>
  );
}

/**
 * The Brand page: the brand's fields over the board, opened from the user
 * menu.
 *
 * Edits go into a local draft and only reach the store on Save. Leaving the
 * page by any route -- the rail, Settings, ⌘, -- goes through the section
 * store's leave guard, so unsaved edits are asked about before they go, and
 * a reload or closed tab gets the browser's own prompt.
 */
function Editor() {
  const saved = useBrand((s) => s.brand);
  const save = useBrand((s) => s.save);
  const [draft, setDraft] = useState<BrandSettings>(saved);
  // Set by any edit rather than worked out by comparing, as it always has
  // been: an edit typed and then undone by hand still counts.
  const [dirty, setDirty] = useState(false);
  // The move a Discard would make, while the confirm is up.
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [toast, showToast] = useToast();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "failed" | "conflict">("idle");

  const fieldId = useId();
  // Where focus was when the confirm opened, for Keep editing.
  const beforeConfirm = useRef<HTMLElement | null>(null);

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

  const edit = (update: (d: BrandSettings) => BrandSettings) => {
    setDraft(update);
    setDirty(true);
  };

  const editCampaign = (update: (brief: Brief) => Brief) => edit((d) => ({ ...d, campaign: update(d.campaign) }));

  // To the account (#454): kept only once the backend has it.
  const onSave = async () => {
    setSaveState("saving");
    const result = await save(draft);
    if (result === "saved") {
      setSaveState("idle");
      setDirty(false);
      showToast("Brand saved");
    } else setSaveState(result);
  };

  const onCancel = () => {
    setDraft(saved);
    setDirty(false);
    setSaveState("idle");
  };

  const keepEditing = () => {
    setPending(null);
    requestAnimationFrame(() => beforeConfirm.current?.focus());
  };

  const discard = () => {
    const proceed = pending;
    setPending(null);
    // Unguarded first, so the move is not asked about a second time.
    setLeaveGuard(null);
    proceed?.();
  };

  return (
    <LibraryPage closable title="Brand" subtitle="What every generation knows about this client. Edits apply once you save.">
      <div className="brand-row">
        <div className="brand-field">
          <label className="brand-field-label" htmlFor={`${fieldId}-industry`}>
            Industry
          </label>
          <input
            id={`${fieldId}-industry`}
            className="brand-input"
            placeholder="e.g. Consumer electronics"
            value={draft.industry}
            onChange={(e) => {
              const industry = e.target.value;
              edit((d) => ({ ...d, industry }));
            }}
          />
        </div>
      </div>

      {saveState === "conflict" && (
        <p className="brand-load-problem" role="alert">
          The brand was saved somewhere else since you opened it.
          <button type="button" className="brief-link" onClick={() => void useBrand.getState().reload()}>
            Load the latest
          </button>
        </p>
      )}

      <CampaignBrief value={draft.campaign} onChange={editCampaign} />

      {/* Locked until Analyze has a backend; shown so the client knows it is coming. */}
      <section className="brand-profile" aria-labelledby={`${fieldId}-profile`}>
        <h2 id={`${fieldId}-profile`} className="brand-section-title">
          Brand Profile
        </h2>
        <label className="brand-field-label" htmlFor={`${fieldId}-url`}>
          Brand homepage URL
        </label>
        <div className="brand-url-row">
          <input
            id={`${fieldId}-url`}
            type="url"
            className="brand-input"
            placeholder="https://example-brand.com"
            value={draft.homepageUrl}
            disabled
            aria-describedby={`${fieldId}-profile-hint`}
          />
          <button type="button" className="brand-primary" disabled>
            Analyze
          </button>
        </div>
        <p id={`${fieldId}-profile-hint`} className="brand-hint">
          Coming soon.
        </p>
      </section>

      {/* Pinned to the bottom of the page while the fields scroll under it. */}
      <div className="brand-save-bar" role="region" aria-label="Save brand">
        {saveState === "failed" && (
          <span className="brand-save-error" role="alert">
            Couldn&apos;t save the brand. Try again.
          </span>
        )}
        {dirty && saveState !== "failed" && (
          <span className="brand-save-state">
            <span className="brand-save-dot" aria-hidden />
            Unsaved changes
          </span>
        )}
        <button type="button" className="brand-pill" onClick={onCancel} disabled={!dirty}>
          Cancel
        </button>
        <button type="button" className="brand-primary" onClick={() => void onSave()} disabled={!dirty || saveState === "saving"}>
          {saveState === "saving" ? "Saving…" : "Save brand"}
        </button>
      </div>

      {pending && <DiscardChanges name="the brand" onKeepEditing={keepEditing} onDiscard={discard} />}
      {toast}
    </LibraryPage>
  );
}
