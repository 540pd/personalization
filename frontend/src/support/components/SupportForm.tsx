"use client";

import { useId, useRef, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { useSupport } from "../useSupport";
import { MESSAGE_MAX, NAME_MAX, draftErrors, firstError, type SupportField } from "../supportDraft";
import type { SupportContext, SupportReply } from "../support.api";
import "./Support.scss";

const ALERTS = {
  failed: "We couldn't send your message. Your text is still here, so you can try again.",
  limit: "Too many messages from this network. Try again in an hour.",
} as const;

/**
 * The support form (#428): the same in the dialog over the board and on the
 * signed-out /support page. Every field is required, said once at the top.
 * Contact us stays clickable: with gaps it shows each error and focuses the
 * first. Sent, the form gives way to "Message sent".
 */
export default function SupportForm({
  context,
  onClose,
  send,
}: {
  context: () => SupportContext;
  /** In the dialog: the ×, and Close once sent. On the page: none. */
  onClose?: () => void;
  /** Sending, when the caller has more to do with the answer (the board's note). */
  send?: (context: SupportContext, website: string) => Promise<SupportReply | null>;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const websiteRef = useRef<HTMLInputElement>(null);
  const draft = useSupport((s) => s.draft);
  const status = useSupport((s) => s.status);
  const checked = useSupport((s) => s.checked);
  const sentFrom = useSupport((s) => s.sentFrom);
  const edit = useSupport((s) => s.edit);
  const submit = useSupport((s) => s.submit);

  const errors = checked ? draftErrors(draft) : {};
  const busy = status === "sending";
  const fieldId = (f: SupportField) => `${id}-${f}`;
  const errorId = (f: SupportField) => `${id}-${f}-error`;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const website = websiteRef.current?.value ?? "";
    const reply = await (send ?? submit)(context(), website);
    if (reply) return;
    // Not sent because of the draft: to the first field that needs work.
    const first = firstError(draftErrors(useSupport.getState().draft));
    if (first) formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(fieldId(first))}`)?.focus();
  };

  const describedBy = (f: SupportField, hint?: string) =>
    [errors[f] ? errorId(f) : null, hint].filter(Boolean).join(" ") || undefined;

  return (
    <section className="support" aria-labelledby={`${id}-title`}>
      <div className="support-head">
        <div className="support-head-text">
          <h2 id={`${id}-title`} className="support-title">
            Support
          </h2>
          {status !== "sent" && (
            <p className="support-intro">Tell us how we can help and we&apos;ll reply by email. All fields are required.</p>
          )}
        </div>
        {onClose && (
          <button type="button" className="support-close" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        )}
      </div>

      {status === "sent" ? (
        <div className="support-sent" role="status">
          <span className="support-sent-icon">
            <Check size={24} aria-hidden />
          </span>
          <h3 className="support-sent-title">Message sent</h3>
          <p className="support-sent-text">
            Thanks, {sentFrom?.name.split(" ")[0]}. We&apos;ll reply to <strong>{sentFrom?.email}</strong>.
          </p>
          {onClose ? (
            <button type="button" className="support-secondary" onClick={onClose}>
              Close
            </button>
          ) : (
            <Link href="/" className="support-link">
              Back to sign in
            </Link>
          )}
        </div>
      ) : (
        <form ref={formRef} className="support-form" noValidate onSubmit={(e) => void onSubmit(e)}>
          <div className="support-field">
            <label htmlFor={fieldId("name")} className="support-label">
              Name
            </label>
            <input
              id={fieldId("name")}
              className="support-input"
              type="text"
              autoComplete="name"
              maxLength={NAME_MAX}
              // The dialog opens on Name; the page lets the visitor start where they like.
              autoFocus={!!onClose}
              value={draft.name}
              disabled={busy}
              aria-invalid={!!errors.name || undefined}
              aria-describedby={describedBy("name")}
              onChange={(e) => edit("name", e.target.value)}
            />
            {errors.name && (
              <span id={errorId("name")} className="support-error">
                {errors.name}
              </span>
            )}
          </div>

          <div className="support-field">
            <label htmlFor={fieldId("email")} className="support-label">
              Email
            </label>
            <input
              id={fieldId("email")}
              className="support-input"
              type="email"
              autoComplete="email"
              value={draft.email}
              disabled={busy}
              aria-invalid={!!errors.email || undefined}
              aria-describedby={describedBy("email", `${id}-email-hint`)}
              onChange={(e) => edit("email", e.target.value)}
            />
            {errors.email && (
              <span id={errorId("email")} className="support-error">
                {errors.email}
              </span>
            )}
            <span id={`${id}-email-hint`} className="support-hint">
              We&apos;ll reply to this address.
            </span>
          </div>

          <fieldset className="support-field support-fieldset" aria-describedby={describedBy("clientProject")}>
            <legend className="support-label">Are you working on a client project?</legend>
            <div className={errors.clientProject ? "support-choices is-invalid" : "support-choices"}>
              {[true, false].map((value, i) => (
                <label key={String(value)} className={draft.clientProject === value ? "support-choice is-chosen" : "support-choice"}>
                  <input
                    // The first is what an error focuses.
                    id={i === 0 ? fieldId("clientProject") : undefined}
                    type="radio"
                    name={`${id}-client`}
                    checked={draft.clientProject === value}
                    disabled={busy}
                    onChange={() => edit("clientProject", value)}
                  />
                  {value ? "Yes" : "No"}
                </label>
              ))}
            </div>
            {errors.clientProject && (
              <span id={errorId("clientProject")} className="support-error">
                {errors.clientProject}
              </span>
            )}
          </fieldset>

          <div className="support-field">
            <label htmlFor={fieldId("message")} className="support-label">
              What is your message for us?
            </label>
            <textarea
              id={fieldId("message")}
              className="support-input support-textarea"
              rows={5}
              maxLength={MESSAGE_MAX}
              placeholder="Tell us what you were trying to do, what happened, and what you expected."
              value={draft.message}
              disabled={busy}
              aria-invalid={!!errors.message || undefined}
              aria-describedby={describedBy("message")}
              onChange={(e) => edit("message", e.target.value)}
            />
            {errors.message && (
              <span id={errorId("message")} className="support-error">
                {errors.message}
              </span>
            )}
          </div>

          {/* Only bots fill this: people never see it, and it is out of the tab order. */}
          <input ref={websiteRef} className="support-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden defaultValue="" />

          {(status === "failed" || status === "limit") && (
            <div className="support-alert" role="alert">
              <AlertCircle size={16} aria-hidden />
              <span>{ALERTS[status]}</span>
            </div>
          )}

          <div className="support-foot">
            <span className="support-fine">We use these details only to reply to your message.</span>
            <button type="submit" className="support-submit" disabled={busy}>
              {busy && <Loader2 size={16} className="support-spin" aria-hidden />}
              {busy ? "Sending…" : "Contact us"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
