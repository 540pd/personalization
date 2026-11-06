"use client";

// Use brand on a Create panel (#452): on by default, kept with the node's
// settings, with one line saying what it will send. The line reads the saved
// Assets page and the brief as the Brand page holds them, by the backend's
// own rules (brandSummary), so it says what actually goes.

import { useId } from "react";
import { useBrand } from "@/store/brand.store";
import { brandSummary } from "../../assets/brandSummary";
import { toAssets, useSavedAssets } from "../Brand/useSavedAssets";
import type { NodeSettings } from "./nodeKinds";

export default function BrandSwitch({ settings, onChange }: { settings: NodeSettings; onChange: (next: NodeSettings) => void }) {
  const id = useId();
  // Absent is on: nodes from before #452 use the brand too.
  const on = (settings as { useBrand?: boolean }).useBrand !== false;
  const brief = useBrand((s) => s.brand.campaign);
  const { load } = useSavedAssets();

  let summary: React.ReactNode;
  if (!on) summary = "Off: only the prompt and its references.";
  else if (load.state === "loading") summary = "Loading…";
  else if (load.state === "failed") summary = "Couldn't load the brand.";
  else {
    const parts = brandSummary(load.view, brief);
    summary = parts.length ? (
      parts.join(" · ")
    ) : (
      <>
        Nothing set up yet.{" "}
        <button type="button" className="node-panel-brand-link" onClick={toAssets}>
          Set it up on Assets
        </button>
      </>
    );
  }

  return (
    <div className="node-panel-brand">
      <div className="node-panel-brand-row">
        <span id={`${id}-label`} className="node-panel-section-label node-panel-brand-label">
          Use brand
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-summary`}
          className={`node-panel-toggle ${on ? "node-panel-toggle-on" : "node-panel-toggle-off"}`}
          onClick={() => onChange({ ...settings, useBrand: !on } as NodeSettings)}
        >
          <span className={`node-panel-toggle-thumb ${on ? "node-panel-toggle-thumb-on" : "node-panel-toggle-thumb-off"}`} />
        </button>
      </div>
      <p id={`${id}-summary`} className="node-panel-brand-summary">
        {summary}
      </p>
    </div>
  );
}
