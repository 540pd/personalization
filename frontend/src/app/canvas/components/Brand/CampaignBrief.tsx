"use client";

// The Campaign Brief (#409): one campaign, edited in place on the Brand page
// and saved with it. Design: the "Brand Page Campaign Brief" canvas linked
// from the issue. Every field keeps its border and a grey example; nothing is
// required.

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Lock } from "lucide-react";
import {
  LANGUAGE,
  MARKET,
  MAX_TONES,
  OBJECTIVES,
  TONES,
  type CampaignBrief as Brief,
  type MandatoryElements,
  type Tone,
} from "@/store/brand.store";
import BriefReferences from "./BriefReferences";
import { BriefLogo, BriefProduct } from "./BriefFromAssets";
import { useSavedAssets } from "./useSavedAssets";

type Edit = (update: (brief: Brief) => Brief) => void;

export default function CampaignBrief({ value, onChange }: { value: Brief; onChange: Edit }) {
  const id = useId();
  const set = <K extends keyof Brief>(key: K, next: Brief[K]) => onChange((b) => ({ ...b, [key]: next }));
  const setMandatory = (key: keyof MandatoryElements, on: boolean) =>
    onChange((b) => ({ ...b, mandatory: { ...b.mandatory, [key]: on } }));
  const toggleTone = (tone: Tone) =>
    onChange((b) => ({ ...b, tones: b.tones.includes(tone) ? b.tones.filter((t) => t !== tone) : [...b.tones, tone] }));
  const tonesFull = value.tones.length >= MAX_TONES;
  // The saved Assets page, once for the product, logo and references (#444).
  const assets = useSavedAssets();

  const text = (key: "name" | "objective" | "audience" | "message" | "offer", placeholder: string, extra = {}) => (
    <input
      id={`${id}-${key}`}
      className="brief-input"
      placeholder={placeholder}
      value={value[key]}
      onChange={(e) => set(key, e.target.value)}
      {...extra}
    />
  );

  return (
    <section className="brief" aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`} className="brand-section-title">
          Campaign Brief
        </h2>
        <p className="brief-lead">Define the campaign details that will guide creative generation.</p>
      </div>

      <div className="brief-card">
        <Group title="Basics">
          <Row label="Campaign Name" htmlFor={`${id}-name`}>
            {text("name", "Urban Running 2026")}
          </Row>
          <Row label="Objective" htmlFor={`${id}-objective`}>
            {text("objective", "Pick one, or describe your own goal", { list: `${id}-objectives` })}
            <datalist id={`${id}-objectives`}>
              {OBJECTIVES.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Row>
          <Row label="Market & language">
            {/* Fixed for this phase: shown so nobody wonders what is assumed. */}
            <div className="brief-readonly">
              <Lock size={14} aria-hidden />
              <span>
                {MARKET} · {LANGUAGE}
              </span>
              <span className="brief-muted">More options coming soon</span>
            </div>
          </Row>
        </Group>

        <Group title="Audience">
          <Row label="Target Audience" htmlFor={`${id}-audience`}>
            {text("audience", "Urban professionals, 25–35")}
          </Row>
          <Row label="Audience Insight" htmlFor={`${id}-insight`} top>
            <GrowingTextarea
              id={`${id}-insight`}
              rows={2}
              placeholder="They want to run, but city routes feel monotonous"
              value={value.insight}
              onChange={(v) => set("insight", v)}
            />
          </Row>
        </Group>

        <Group title="Message">
          <Row label="Key Message" htmlFor={`${id}-message`}>
            {text("message", "Performance and comfort for everyday city running")}
          </Row>
          <Row label="Tone" labelId={`${id}-tone`}>
            <div role="group" aria-labelledby={`${id}-tone`} className="brief-chips">
              {TONES.map((tone) => {
                const picked = value.tones.includes(tone);
                return (
                  <button
                    key={tone}
                    type="button"
                    className="brief-chip"
                    aria-pressed={picked}
                    // A fourth waits until one is unpicked.
                    disabled={!picked && tonesFull}
                    onClick={() => toggleTone(tone)}
                  >
                    {tone}
                  </button>
                );
              })}
              <span className="brief-muted">Up to {MAX_TONES}</span>
            </div>
          </Row>
        </Group>

        {/* The product itself is described on the Assets page, not here. */}
        <Group title="Offer">
          <Row label={<>Offer <span className="brief-muted">(optional)</span></>} htmlFor={`${id}-offer`}>
            {text("offer", "20% off until Sunday")}
          </Row>
        </Group>

        <Group title="Mandatory elements" lead="On: it must be kept or included when creative is generated.">
          <Mandatory id={`${id}-m-product`} label="Product" on={value.mandatory.product} onToggle={(on) => setMandatory("product", on)}>
            <BriefProduct load={assets.load} />
          </Mandatory>
          <Mandatory id={`${id}-m-logo`} label="Logo" on={value.mandatory.logo} onToggle={(on) => setMandatory("logo", on)}>
            <BriefLogo load={assets.load} />
          </Mandatory>
          <Mandatory id={`${id}-m-cta`} label="CTA" on={value.mandatory.cta} onToggle={(on) => setMandatory("cta", on)}>
            <input
              className="brief-input"
              aria-label="CTA text"
              placeholder="Shop now"
              value={value.ctaText}
              onChange={(e) => set("ctaText", e.target.value)}
            />
          </Mandatory>
          <Mandatory id={`${id}-m-legal`} label="Legal Copy" on={value.mandatory.legal} onToggle={(on) => setMandatory("legal", on)} top>
            <GrowingTextarea
              aria-label="Legal copy text"
              rows={2}
              placeholder="Offer valid while stocks last. T&Cs apply."
              value={value.legalText}
              onChange={(v) => set("legalText", v)}
            />
          </Mandatory>
        </Group>

        <Group title="Creative references" lead="Pick the backgrounds, scenes and mood boards from Assets that this campaign uses." layout="block">
          <BriefReferences load={assets.load} onRetry={assets.retry} picked={value.referenceIds} onChange={(ids) => set("referenceIds", ids)} />
        </Group>

        <Group title="Guardrails" layout="block">
          <div className="brief-rules">
            <div className="brief-rule">
              <label htmlFor={`${id}-dos`} className="brief-label">
                Do
              </label>
              <GrowingTextarea
                id={`${id}-dos`}
                rows={3}
                aria-describedby={`${id}-rules-hint`}
                placeholder={"Show the product in motion\nKeep the city setting in daylight"}
                value={value.dos}
                onChange={(v) => set("dos", v)}
              />
            </div>
            <div className="brief-rule">
              <label htmlFor={`${id}-donts`} className="brief-label">
                Don&apos;t
              </label>
              <GrowingTextarea
                id={`${id}-donts`}
                rows={3}
                aria-describedby={`${id}-rules-hint`}
                placeholder={"Show competitor products\nMake health or performance claims"}
                value={value.donts}
                onChange={(v) => set("donts", v)}
              />
            </div>
          </div>
          <p id={`${id}-rules-hint`} className="brief-muted brief-rules-hint">
            Write as much as you need. Each rule on its own line reads best.
          </p>
        </Group>
      </div>
    </section>
  );
}

/** A titled group: label/field rows, or (`block`) its own layout, as Guardrails' two columns. */
function Group({
  title,
  lead,
  layout = "rows",
  children,
}: {
  title: string;
  lead?: string;
  layout?: "rows" | "block";
  children: ReactNode;
}) {
  return (
    <div className="brief-group">
      <h3 className="brief-group-title">{title}</h3>
      {lead && <p className="brief-muted brief-group-lead">{lead}</p>}
      {layout === "rows" ? <div className="brief-rows">{children}</div> : children}
    </div>
  );
}

/** A label beside its field; `top` aligns the label with a taller field's first line. */
function Row({
  label,
  htmlFor,
  labelId,
  top,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  labelId?: string;
  top?: boolean;
  children: ReactNode;
}) {
  const className = top ? "brief-label is-top" : "brief-label";
  return (
    <>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={className}>
          {label}
        </label>
      ) : (
        <span id={labelId} className={className}>
          {label}
        </span>
      )}
      <div className="brief-field">{children}</div>
    </>
  );
}

/** A switch, its name, and what it asks for while on (kept while off). */
function Mandatory({
  id,
  label,
  on,
  onToggle,
  top,
  children,
}: {
  id: string;
  label: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <div className={top ? "brief-mandatory is-top" : "brief-mandatory"}>
        <button
          type="button"
          role="switch"
          className="brief-switch"
          aria-checked={on}
          // Not just "Product": the Offer group has a Product field too, and
          // two controls of one name cannot be told apart by ear.
          aria-label={`${label} mandatory`}
          onClick={() => onToggle(!on)}
        >
          <span className="brief-switch-thumb" aria-hidden />
        </button>
        <span id={id} className="brief-mandatory-name">
          {label}
        </span>
      </div>
      <div className="brief-field">{on ? children : <span className="brief-muted">Not required for this campaign.</span>}</div>
    </>
  );
}

/** A textarea that grows with its text from `rows` lines, rather than scrolling. */
function GrowingTextarea({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  rows: number;
  placeholder: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`; // + the two border pixels
  }, [value]);
  return <textarea ref={ref} className="brief-input brief-textarea" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
