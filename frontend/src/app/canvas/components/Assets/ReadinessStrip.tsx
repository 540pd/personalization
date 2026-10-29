"use client";

// "Ready for generation", under the Assets page's title (#419): the master
// image, product name, logo and colours, each marked done (✓), missing (!)
// or optional and not set (–), live as the page changes. Each is a link to
// its part of the page. Save's banner still says what blocks it.

import type { MouseEvent } from "react";
import type { ReadyItem, ReadyState } from "../../assets/assetsDraft";

/** Where each item leads, and what there takes focus. */
export const READY_TARGETS: Record<ReadyItem["key"], { id: string; focus: string }> = {
  master: { id: "assets-master", focus: "button, textarea, select, input" },
  name: { id: "assets-product-name", focus: "input" },
  logo: { id: "assets-logo", focus: "button, textarea, select" },
  colours: { id: "assets-colours", focus: ".assets-colour-input" },
};

const MARKS: Record<ReadyState, { mark: string; says: string }> = {
  done: { mark: "✓", says: "done" },
  missing: { mark: "!", says: "missing" },
  optional: { mark: "–", says: "not set" },
};

export default function ReadinessStrip({ items }: { items: ReadyItem[] }) {
  const jump = (key: ReadyItem["key"]) => (e: MouseEvent) => {
    const target = READY_TARGETS[key];
    const el = document.getElementById(target.id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.querySelector<HTMLElement>(target.focus)?.focus({ preventScroll: true });
  };

  return (
    <nav className="assets-ready" aria-label="Ready for generation">
      <span className="assets-ready-title">Ready for generation</span>
      {items.map((item) => (
        <a key={item.key} href={`#${READY_TARGETS[item.key].id}`} className={`assets-ready-item is-${item.state}`} onClick={jump(item.key)}>
          <span className="assets-ready-mark" aria-hidden>
            {MARKS[item.state].mark}
          </span>
          {item.label}
          <span className="sr-only">: {MARKS[item.state].says}</span>
        </a>
      ))}
    </nav>
  );
}
