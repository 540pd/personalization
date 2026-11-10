// Support messages by email (#428), over SMTP: any provider -- Google
// Workspace's relay, SendGrid, Mailgun -- with no code change. Without
// SUPPORT_EMAIL_TO, SUPPORT_EMAIL_FROM and SMTP_HOST it is the placeholder:
// messages are kept and logged, not emailed.

import nodemailer from "nodemailer";
import type { SupportMessage } from "./store.js";

export interface SupportMailConfig {
  to: string[];
  from: string;
  host: string;
  port: number;
  /** Both or neither: a relay that trusts the sender's address needs none. */
  user?: string;
  pass?: string;
}

const env = (name: string) => process.env[name]?.trim() || undefined;

/** The SMTP settings, or null while support email is the placeholder. */
export function supportMailConfig(): SupportMailConfig | null {
  const to = (env("SUPPORT_EMAIL_TO") ?? "").split(",").map((a) => a.trim()).filter(Boolean);
  const from = env("SUPPORT_EMAIL_FROM");
  const host = env("SMTP_HOST");
  if (!to.length || !from || !host) return null;
  const port = Number(env("SMTP_PORT") ?? 587);
  return { to, from, host, port: Number.isFinite(port) ? port : 587, user: env("SMTP_USER"), pass: env("SMTP_PASS") };
}

export function supportSubject(m: SupportMessage): string {
  return `Support: ${m.name} (client project: ${m.clientProject ? "Yes" : "No"})`;
}

/** The email's text: the message, then everything that helps answer it. */
export function supportBody(m: SupportMessage): string {
  const c = m.context;
  const lines = [
    m.message,
    "",
    "--",
    `Name: ${m.name}`,
    `Email: ${m.email}`,
    `Client project: ${m.clientProject ? "Yes" : "No"}`,
    `Signed in as: ${m.account ?? "not signed in"}`,
    c.page && `Page: ${c.page}`,
    c.boardId && `Board: ${c.boardId}`,
    c.appVersion && `App version: ${c.appVersion}`,
    c.userAgent && `Browser: ${c.userAgent}`,
    `Sent: ${m.createdAt}`,
    `Message id: ${m.id}`,
  ];
  return lines.filter((l): l is string => typeof l === "string").join("\n");
}

/** Emails the message to the team; Reply-To is the sender, so Reply answers them. */
export async function emailSupportMessage(m: SupportMessage, config: SupportMailConfig): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
  });
  await transport.sendMail({
    from: config.from,
    to: config.to,
    replyTo: { name: m.name, address: m.email },
    subject: supportSubject(m),
    text: supportBody(m),
  });
}
