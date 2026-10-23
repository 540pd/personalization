"use client";

// GCOS reference: docs/sidebar/gcos_user_click_brand.png, _2.png, _3.png
// Spec: #72 (the fields), #219 (a page over the board, like Settings).
// Brand Profile sits at the end, as in the mockup, and is locked until
// Analyze has a backend. When it does, it is meant to fill in the fields
// above it.

import { useEffect, useId, useRef, useState } from "react";
import { useSection, setLeaveGuard } from "@/store/section.store";
import {
  ART_DIRECTION_COMPONENTS,
  useBrand,
  type ArtDirection,
  type ArtDirectionId,
  type BrandSettings,
} from "@/store/brand.store";
import { useToast } from "@/components/Toast/useToast";
import LibraryPage from "../Library/LibraryPage";
import { DiscardChanges } from "../Library/LibraryDialog";
import ArtDirectionCard from "./ArtDirectionCard";
import "./Brand.scss";

export default function BrandPage() {
  const shown = useSection((s) => s.section === "brand");
  return shown ? <Page /> : null;
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
function Page() {
  const saved = useBrand((s) => s.brand);
  const save = useBrand((s) => s.save);
  const [draft, setDraft] = useState<BrandSettings>(saved);
  // Set by any edit rather than worked out by comparing: the draft holds
  // reference images as data URLs, too big to serialise on every keystroke.
  const [dirty, setDirty] = useState(false);
  // The move a Discard would make, while the confirm is up.
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [toast, showToast] = useToast();

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

  const updateComponent = (id: ArtDirectionId, update: (prev: ArtDirection) => ArtDirection) =>
    edit((d) => ({ ...d, components: { ...d.components, [id]: update(d.components[id]) } }));

  const onSave = () => {
    save(draft);
    setDirty(false);
    showToast("Brand saved");
  };

  const onCancel = () => {
    setDraft(saved);
    setDirty(false);
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
    <LibraryPage title="Brand" subtitle="What every generation knows about this client. Edits apply once you save.">
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

      <section className="brand-section" aria-labelledby={`${fieldId}-components`}>
        <h2 id={`${fieldId}-components`} className="brand-subheading">
          Art-direction components
        </h2>
        <div className="brand-cards">
          {ART_DIRECTION_COMPONENTS.map(({ id, label }) => (
            <ArtDirectionCard
              key={id}
              label={label}
              value={draft.components[id]}
              onChange={(update) => updateComponent(id, update)}
            />
          ))}
        </div>
      </section>

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
        {dirty && (
          <span className="brand-save-state">
            <span className="brand-save-dot" aria-hidden />
            Unsaved changes
          </span>
        )}
        <button type="button" className="brand-pill" onClick={onCancel} disabled={!dirty}>
          Cancel
        </button>
        <button type="button" className="brand-primary" onClick={onSave} disabled={!dirty}>
          Save brand
        </button>
      </div>

      {pending && <DiscardChanges name="the brand" onKeepEditing={keepEditing} onDiscard={discard} />}
      {toast}
    </LibraryPage>
  );
}
