// The support form's message to the team (#428), through /api/proxy. The
// route needs no sign-in, so it works from the sign-in screen too.

import { apiFetch } from "@/api/canvas.api";
import type { SupportDraft } from "./supportDraft";

/** Where the sender was; the backend keeps only these, as short strings. */
export interface SupportContext {
  page?: string;
  appVersion?: string;
  userAgent?: string;
}

export type SupportReply =
  | { ok: true }
  /** Too many from this network in the last hour. */
  | { ok: false; kind: "limit" }
  /** Offline, the server failing, or refused: worth trying again. */
  | { ok: false; kind: "failed" };

/** `website` is the hidden field only bots fill. */
export async function sendSupportMessage(draft: SupportDraft, context: SupportContext, website = ""): Promise<SupportReply> {
  const body = JSON.stringify({
    name: draft.name.trim(),
    email: draft.email.trim(),
    clientProject: draft.clientProject,
    message: draft.message.trim(),
    context,
    website,
  });
  let res: Response;
  try {
    res = await apiFetch("support", { method: "POST", body });
  } catch {
    return { ok: false, kind: "failed" };
  }
  if (res.ok) return { ok: true };
  if (res.status === 429) return { ok: false, kind: "limit" };
  return { ok: false, kind: "failed" };
}
