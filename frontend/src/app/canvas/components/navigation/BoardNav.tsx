"use client";

// Luma reference: BOARD-02 — Board and page navigation dropdown.
// Stub: renders the trigger button. Real navigation is a future issue.

import { useState } from "react";

export default function BoardNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-neutral-200 hover:bg-neutral-800 transition-colors"
      >
        <span>Board / Page</span>
        <span className="text-neutral-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {/* TODO: implement board/page navigation menu — issue BOARD-02 */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-lg bg-neutral-900 border border-neutral-700 shadow-xl p-2 text-sm text-neutral-400">
          Board navigation coming soon.
        </div>
      )}
    </div>
  );
}
