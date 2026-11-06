"use client";

import { create } from "zustand";
import { sendSupportMessage, type SupportContext, type SupportReply } from "./support.api";
import { EMPTY_DRAFT, draftErrors, type SupportDraft, type SupportField } from "./supportDraft";

/**
 * The support form (#428): its draft, and where sending stands. A store, not
 * the form's own state, so the draft outlives the dialog -- closed by
 * accident, it is all there on reopening -- and a send outlives it too.
 * Memory only: a reload starts afresh. Only a successful send clears it.
 */

export type SupportStatus = "editing" | "sending" | "sent" | "failed" | "limit";

interface SupportState {
  draft: SupportDraft;
  status: SupportStatus;
  /** Set by the first Contact us: from then on, errors show as they stand. */
  checked: boolean;
  /** Who the last message was from, for "Thanks, Priya. We'll reply to…". */
  sentFrom: { name: string; email: string } | null;
  edit: <K extends SupportField>(field: K, value: SupportDraft[K]) => void;
  /**
   * Sends the draft, or, when it has errors, marks them and answers null so
   * the form can focus the first. Never two at once.
   */
  submit: (context: SupportContext, website?: string) => Promise<SupportReply | null>;
  /** After "Message sent" is seen: the next open is a fresh form. */
  startOver: () => void;
}

export const useSupport = create<SupportState>((set, get) => ({
  draft: EMPTY_DRAFT,
  status: "editing",
  checked: false,
  sentFrom: null,
  edit: (field, value) => set((s) => ({ draft: { ...s.draft, [field]: value } })),
  async submit(context, website = "") {
    const { draft, status } = get();
    if (status === "sending") return null;
    if (Object.keys(draftErrors(draft)).length) {
      set({ checked: true });
      return null;
    }
    set({ status: "sending", checked: true });
    const reply = await sendSupportMessage(draft, context, website);
    if (reply.ok) {
      set({ status: "sent", draft: EMPTY_DRAFT, checked: false, sentFrom: { name: draft.name.trim(), email: draft.email.trim() } });
    } else {
      set({ status: reply.kind });
    }
    return reply;
  },
  startOver: () => set((s) => (s.status === "sent" ? { status: "editing", sentFrom: null } : s)),
}));
