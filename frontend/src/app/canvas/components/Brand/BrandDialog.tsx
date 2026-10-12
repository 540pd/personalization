"use client";

// GCOS reference: docs/sidebar/gcos_user_click_brand.png, _2.png, _3.png
// Spec: #72. Brand Profile sits at the end, as in the mockup, and is locked
// until Analyze has a backend. When it does, it is meant to fill in the
// fields above it.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  ART_DIRECTION_COMPONENTS,
  useBrand,
  type ArtDirection,
  type ArtDirectionId,
  type BrandSettings,
} from "@/store/brand.store";
import ArtDirectionCard from "./ArtDirectionCard";
import "./Brand.scss";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]):not([hidden]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab cycling inside `container`. */
function trapTab(e: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const outside = !container.contains(active);
  if (e.shiftKey && (active === first || outside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || outside)) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * The Brand popup: opens straight to the editable form over a dimmed canvas.
 *
 * Edits go into a local draft and only reach the store on Save, so closing
 * is always a discard -- which is why closing with changes asks first.
 */
export default function BrandDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const saved = useBrand((s) => s.brand);
  const save = useBrand((s) => s.save);
  const [draft, setDraft] = useState<BrandSettings>(saved);
  const [confirming, setConfirming] = useState(false);

  const titleId = useId();
  const fieldId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  // Where focus was when the discard prompt opened, to go back on "Keep editing".
  const beforeConfirmRef = useRef<HTMLElement | null>(null);

  // Focus in on open, back to whatever opened us on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    if (confirming) keepEditingRef.current?.focus();
  }, [confirming]);

  // Compared at close time only, so typing does not pay for serialising
  // reference images on every keystroke.
  const requestClose = () => {
    if (JSON.stringify(draft) === JSON.stringify(saved)) {
      onClose();
      return;
    }
    beforeConfirmRef.current = document.activeElement as HTMLElement | null;
    setConfirming(true);
  };

  const keepEditing = () => {
    setConfirming(false);
    // After the panel is no longer inert, or the focus call is ignored.
    requestAnimationFrame(() => beforeConfirmRef.current?.focus());
  };

  const setField = (key: "industry", value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const updateComponent = (id: ArtDirectionId, update: (prev: ArtDirection) => ArtDirection) =>
    setDraft((d) => ({ ...d, components: { ...d.components, [id]: update(d.components[id]) } }));

  const onKeyDown = (e: KeyboardEvent) => {
    // Nothing typed in here is meant for the canvas behind. This stops the
    // bubble-phase listeners on document and window (pan, zoom, delete,
    // dock hotkeys); the two capture-phase ones skip modals themselves.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      if (confirming) keepEditing();
      else requestClose();
    } else if (e.key === "Tab") {
      trapTab(e, confirming ? confirmRef.current : panelRef.current);
    }
  };

  return createPortal(
    <div
      className="brand-overlay"
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        className="brand-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={confirming}
      >
        <header className="brand-dialog-head">
          <h2 id={titleId} className="brand-dialog-title">
            Brand
          </h2>
          <button type="button" className="brand-icon-button" aria-label="Close" onClick={requestClose}>
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="brand-dialog-body">
          <div className="brand-row">
            <div className="brand-field">
              <label className="brand-field-label" htmlFor={`${fieldId}-industry`}>
                Industry
              </label>
              <input
                ref={firstFieldRef}
                id={`${fieldId}-industry`}
                className="brand-input"
                placeholder="e.g. Consumer electronics"
                value={draft.industry}
                onChange={(e) => setField("industry", e.target.value)}
              />
            </div>
          </div>

          <h3 className="brand-subheading">Art-direction components</h3>
          {ART_DIRECTION_COMPONENTS.map(({ id, label }) => (
            <ArtDirectionCard
              key={id}
              label={label}
              value={draft.components[id]}
              onChange={(update) => updateComponent(id, update)}
            />
          ))}

          {/* Locked until Analyze has a backend; shown so the client knows it is coming. */}
          <section className="brand-profile" aria-labelledby={`${fieldId}-profile`}>
            <h3 id={`${fieldId}-profile`} className="brand-section-title">
              Brand Profile
            </h3>
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
        </div>

        <footer className="brand-dialog-foot">
          <button type="button" className="brand-pill" onClick={requestClose}>
            Cancel
          </button>
          <button
            type="button"
            className="brand-primary"
            onClick={() => {
              save(draft);
              onSaved();
            }}
          >
            Save brand
          </button>
        </footer>
      </div>

      {confirming && (
        <div
          className="brand-confirm-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) keepEditing();
          }}
        >
          <div
            ref={confirmRef}
            className="brand-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${fieldId}-confirm-title`}
            aria-describedby={`${fieldId}-confirm-desc`}
          >
            <h3 id={`${fieldId}-confirm-title`} className="brand-confirm-title">
              Discard changes?
            </h3>
            <p id={`${fieldId}-confirm-desc`} className="brand-confirm-text">
              Your edits to the brand haven&apos;t been saved.
            </p>
            <div className="brand-confirm-actions">
              <button ref={keepEditingRef} type="button" className="brand-pill" onClick={keepEditing}>
                Keep editing
              </button>
              <button type="button" className="brand-danger" onClick={onClose}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
