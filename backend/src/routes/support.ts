import { Router, type Request } from "express";
import { signedInEmail } from "../middleware/requireIdentity.js";
import { emailSupportMessage, supportMailConfig } from "../lib/support/mailer.js";
import { rateLimiter } from "../lib/support/rateLimit.js";
import { supportStore, type SupportContext, type SupportMessage } from "../lib/support/store.js";
import { currentIsoDate } from "../utils/date.js";
import { createId } from "../utils/id.js";

// POST /api/support (#428): the support form. NOT gated by requireIdentity:
// anyone may write in, signed in or not, so it is limited per address and
// has a hidden field only bots fill. Kept first, then emailed when SMTP is
// set up; an email that fails leaves the message kept and logged.

export const SUPPORT_LIMIT_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTEXT_KEYS = ["page", "boardId", "appVersion", "userAgent"] as const;

type Field = "name" | "email" | "clientProject" | "message";

function invalid(body: Record<string, unknown>): { field: Field; message: string } | null {
  const { name, email, clientProject, message } = body;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100 || /[\r\n]/.test(name)) {
    return { field: "name", message: "Name must be 1 to 100 characters on one line." };
  }
  if (typeof email !== "string" || email.trim().length > 254 || !EMAIL.test(email.trim())) {
    return { field: "email", message: "Email must be a full email address." };
  }
  if (typeof clientProject !== "boolean") {
    return { field: "clientProject", message: "clientProject must be true or false." };
  }
  if (typeof message !== "string" || message.trim().length < 10 || message.trim().length > 5000) {
    return { field: "message", message: "Message must be 10 to 5,000 characters." };
  }
  return null;
}

/** The context's known fields, as short strings; anything else is dropped. */
function contextOf(value: unknown): SupportContext {
  const context: SupportContext = {};
  if (!value || typeof value !== "object") return context;
  for (const key of CONTEXT_KEYS) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) context[key] = v.trim().slice(0, 500);
  }
  return context;
}

/**
 * The sender's address. Through /api/proxy the backend sees the frontend's,
 * so the proxy passes the browser's on as X-Client-IP.
 */
const clientAddress = (req: Request) => req.header("X-Client-IP")?.trim() || req.ip || "unknown";

export function supportRouter(): Router {
  const router = Router();
  const allow = rateLimiter(SUPPORT_LIMIT_PER_HOUR, HOUR_MS);

  router.post("/support", async (req, res, next) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // The hidden field: a person never sees it, so it is a bot. It is told
    // the message went, so it has no reason to try again.
    if (typeof body.website === "string" && body.website.trim()) {
      console.log("[support] Dropped a message that filled the hidden field.");
      res.json({ ok: true });
      return;
    }

    const problem = invalid(body);
    if (problem) {
      res.status(400).json({ error: "validation_error", field: problem.field, message: problem.message });
      return;
    }

    if (!allow(clientAddress(req))) {
      res.status(429).json({ error: "too_many_messages", message: "Too many messages from this network. Try again in an hour." });
      return;
    }

    const message: SupportMessage = {
      id: createId(),
      createdAt: currentIsoDate(),
      name: (body.name as string).trim(),
      email: (body.email as string).trim(),
      clientProject: body.clientProject as boolean,
      message: (body.message as string).trim(),
      context: contextOf(body.context),
      account: await signedInEmail(req),
    };

    try {
      await supportStore().save(message);
    } catch (err) {
      next(err);
      return;
    }

    const config = supportMailConfig();
    if (!config) {
      console.log(`[support] Message ${message.id} kept, not emailed (placeholder: set SUPPORT_EMAIL_TO, SUPPORT_EMAIL_FROM, SMTP_HOST).`);
    } else {
      try {
        await emailSupportMessage(message, config);
      } catch (err) {
        console.error(`[support] Message ${message.id} kept, but emailing it failed`, err);
      }
    }
    res.json({ ok: true });
  });

  return router;
}
