"use client";

// Section 2 of the Assets page: the brand identity creatives keep to. The
// logo and brand colours (#417), then the style examples (#416), passed in
// as `children`, and brand guidelines, which are coming later.

import { useId, type ReactNode } from "react";

export default function BrandSection({ children }: { children: ReactNode }) {
  const id = useId();
  return (
    <section className="assets-section" aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`} className="assets-section-title">
          2 · Brand Assets
        </h2>
        <p className="assets-lead">The brand identity Content Studio should keep generated creatives consistent with.</p>
      </div>
      {children}
      <div className="assets-group assets-guidelines" role="group" aria-labelledby={`${id}-guidelines`}>
        <div>
          <h3 id={`${id}-guidelines`} className="assets-label">
            Brand guidelines <span className="assets-muted">(optional)</span>
          </h3>
          <p className="assets-hint">Upload existing guidelines to improve brand consistency.</p>
        </div>
        <div className="assets-details-actions">
          <button type="button" className="assets-pill" disabled>
            Upload guidelines
          </button>
          <span className="assets-tag">Coming soon</span>
        </div>
      </div>
    </section>
  );
}
