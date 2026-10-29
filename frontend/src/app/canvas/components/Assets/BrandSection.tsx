"use client";

// Section 2 of the Assets page: the brand identity creatives keep to. For
// now its style examples (#416); the logo and brand colours come before
// them with #417.

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
    </section>
  );
}
