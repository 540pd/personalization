"use client";

// The Campaign Brief's creative references (#442): the references saved on
// the Assets page (#418), picked for this campaign. Always ones are in use
// whatever the brief says; the rest are toggles. The library itself is edited
// on Assets only, so this links there rather than adding or changing any.

import { useId } from "react";
import { Check } from "lucide-react";
import { briefReferences, referenceSummary, togglePick } from "../../assets/briefReferences";
import { toAssets, type SavedAssets } from "./useSavedAssets";

const USE_LABEL = { asIs: "As is", inspiration: "Inspiration only" } as const;
const ALWAYS_HINT = "Every campaign uses it. Change this on the Assets page.";

export default function BriefReferences({
  load,
  onRetry,
  picked,
  onChange,
}: {
  /** The saved Assets page, shared with the brief's product and logo rows (#444). */
  load: SavedAssets;
  onRetry: () => void;
  picked: string[];
  onChange: (ids: string[]) => void;
}) {
  const id = useId();

  if (load.state === "loading") return <p className="brief-muted">Loading references…</p>;

  if (load.state === "failed")
    return (
      <p className="brief-refs-problem" role="alert">
        Couldn&apos;t load the references.
        <button type="button" className="brief-link" onClick={onRetry}>
          Retry
        </button>
      </p>
    );

  const refs = briefReferences(load.view, picked);
  if (!refs.length)
    return (
      <div className="brief-refs-empty">
        <span className="brief-muted">No creative references yet.</span>
        <button type="button" className="brand-pill" onClick={toAssets}>
          Add them on the Assets page
        </button>
      </div>
    );

  return (
    <div className="brief-refs">
      <p className="brief-refs-summary" aria-live="polite">
        {referenceSummary(refs)}
      </p>
      <span id={`${id}-always`} hidden>
        {ALWAYS_HINT}
      </span>
      <ul className="brief-refs-grid" aria-label="Creative references">
        {refs.map((r) => (
          <li key={r.asset.id}>
            <button
              type="button"
              className="brief-ref"
              aria-pressed={r.inUse}
              // An Always reference is in use whatever the brief says: shown, not toggled.
              aria-disabled={r.always || undefined}
              aria-describedby={r.always ? `${id}-always` : undefined}
              title={r.always ? ALWAYS_HINT : undefined}
              onClick={() => !r.always && onChange(togglePick(picked, r.asset.id))}
            >
              <span className="brief-ref-image">
                <img src={r.asset.url} alt="" />
                {r.always ? (
                  <span className="brief-ref-always">Always</span>
                ) : (
                  r.inUse && (
                    <span className="brief-ref-check" aria-hidden>
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )
                )}
              </span>
              <span className="brief-ref-name">{r.asset.description || r.asset.name}</span>
              <span className="brief-ref-meta">
                {r.type} · {USE_LABEL[r.use]}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="brief-link" onClick={toAssets}>
        Manage on the Assets page
      </button>
    </div>
  );
}
