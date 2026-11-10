// The support form's draft and its checks (#428). The same limits as the
// backend's POST /api/support, so the form says what is wrong before
// sending rather than after.

export interface SupportDraft {
  name: string;
  email: string;
  /** null until Yes or No is chosen: neither is picked to begin with. */
  clientProject: boolean | null;
  message: string;
}

export type SupportField = keyof SupportDraft;

export const EMPTY_DRAFT: SupportDraft = { name: "", email: "", clientProject: null, message: "" };

/** In the order they appear, so the first wrong one takes focus. */
export const FIELD_ORDER: SupportField[] = ["name", "email", "clientProject", "message"];

export const NAME_MAX = 100;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 5000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is wrong with each field, in words for under it; empty when it can be sent. */
export function draftErrors(d: SupportDraft): Partial<Record<SupportField, string>> {
  const errors: Partial<Record<SupportField, string>> = {};
  const name = d.name.trim();
  if (!name) errors.name = "Enter your name.";
  else if (name.length > NAME_MAX) errors.name = `Use ${NAME_MAX} characters or fewer.`;

  const email = d.email.trim();
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL.test(email)) errors.email = "Enter a full email address, like name@company.com.";

  if (d.clientProject === null) errors.clientProject = "Choose Yes or No.";

  const message = d.message.trim();
  if (message.length < MESSAGE_MIN) errors.message = `Tell us a bit more: at least ${MESSAGE_MIN} characters.`;
  else if (message.length > MESSAGE_MAX) errors.message = "Keep it under 5,000 characters.";
  return errors;
}

export const firstError = (errors: Partial<Record<SupportField, string>>) => FIELD_ORDER.find((f) => errors[f]);
