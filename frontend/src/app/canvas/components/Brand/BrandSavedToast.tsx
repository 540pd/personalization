"use client";

import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import "./Brand.scss";

/** The confirmation after Save, shown once the popup has closed. */
export default function BrandSavedToast() {
  return createPortal(
    <div className="brand-toast" role="status">
      <Check size={16} aria-hidden />
      Brand saved
    </div>,
    document.body,
  );
}
