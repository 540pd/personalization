"use client";

// Section 2 of the Assets page: the brand identity creatives keep to. The
// logo and brand colours (#417), the brand guidelines (#450) and the style
// examples (#416), passed in as `children`.

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
