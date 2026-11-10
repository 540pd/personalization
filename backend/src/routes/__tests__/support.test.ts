import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Express } from "express";

// The support form (#428): POST /api/support, open to anyone, checked,
// limited per address, kept, then emailed when SMTP is set up.

const SECRET = "test-secret";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));

const SMTP = {
  SUPPORT_EMAIL_TO: "support@team.test, lead@team.test",
  SUPPORT_EMAIL_FROM: "no-reply@team.test",
  SMTP_HOST: "smtp.team.test",
  SMTP_USER: "mailer",
  SMTP_PASS: "secret",
};

async function setup(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
  vi.stubEnv("SESSION_SECRET", SECRET);
  for (const k of ["FIRESTORE_PROJECT_ID", "GCS_BUCKET_NAME", "AUTH_MODE", ...Object.keys(SMTP), "SMTP_PORT"]) vi.stubEnv(k, "");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { createApp } = await import("../../server.js");
  const { supportStore } = await import("../../lib/support/store.js");
  return { app: createApp(), saved: () => supportStore().list() };
}

const valid = {
  name: "Priya Sharma",
  email: "priya@company.test",
  clientProject: true,
  message: "The image generator keeps failing on my board.",
  context: { page: "/", boardId: "b1", appVersion: "0.0.1", userAgent: "Test browser" },
};

const send = (app: Express, body: object, ip = "203.0.113.7") =>
  request(app).post("/api/support").set("X-Client-IP", ip).send(body);

beforeEach(() => {
  sendMail.mockReset().mockResolvedValue({});
  createTransport.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/support", () => {
  it("takes a message without sign-in, keeps it, and with no SMTP only logs it", async () => {
    const { app, saved } = await setup();
    const res = await send(app, valid);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const [kept] = await saved();
    expect(kept).toMatchObject({
      name: "Priya Sharma",
      email: "priya@company.test",
      clientProject: true,
      message: valid.message,
      context: valid.context,
      account: null,
    });
    expect(createTransport).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/kept, not emailed \(placeholder/));
  });

  it("notes a signed-in sender's account, but replies go to the email typed", async () => {
    const { app, saved } = await setup();
    const cookie = `gcos_session=${jwt.sign({ email: "ana@accenture.com" }, SECRET, { expiresIn: 3600 })}`;
    await send(app, valid).set("Cookie", cookie).expect(200);
    expect((await saved())[0]).toMatchObject({ account: "ana@accenture.com", email: "priya@company.test" });
  });

  it("emails it over SMTP, with Reply-To the sender", async () => {
    const { app } = await setup(SMTP);
    await send(app, { ...valid, clientProject: false }).expect(200);
    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.team.test",
      port: 587,
      secure: false,
      auth: { user: "mailer", pass: "secret" },
    });
    const mail = sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({
      from: "no-reply@team.test",
      to: ["support@team.test", "lead@team.test"],
      replyTo: { name: "Priya Sharma", address: "priya@company.test" },
      subject: "Support: Priya Sharma (client project: No)",
    });
    expect(mail.text).toContain(valid.message);
    expect(mail.text).toContain("Signed in as: not signed in");
    expect(mail.text).toContain("Board: b1");
    expect(mail.text).toContain("Browser: Test browser");
  });

  it("keeps the message and still answers ok when the email fails", async () => {
    const { app, saved } = await setup(SMTP);
    sendMail.mockRejectedValue(new Error("SMTP down"));
    await send(app, valid).expect(200, { ok: true });
    expect(await saved()).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/emailing it failed/), expect.any(Error));
  });

  it.each([
    ["name", { name: "  " }],
    ["name", { name: "x".repeat(101) }],
    ["name", { name: "Priya\nBcc: x@y.test" }],
    ["email", { email: "priya@" }],
    ["email", { email: 42 }],
    ["clientProject", { clientProject: "yes" }],
    ["clientProject", { clientProject: undefined }],
    ["message", { message: "Help" }],
    ["message", { message: "x".repeat(5001) }],
  ])("refuses a bad %s with 400, naming the field", async (field, change) => {
    const { app, saved } = await setup();
    const res = await send(app, { ...valid, ...change });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "validation_error", field });
    expect(await saved()).toHaveLength(0);
  });

  it("drops a message that fills the hidden field, answering ok", async () => {
    const { app, saved } = await setup(SMTP);
    await send(app, { ...valid, website: "https://spam.test" }).expect(200, { ok: true });
    expect(await saved()).toHaveLength(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("allows 5 messages an hour from one address, then 429; another address is unaffected", async () => {
    const { app, saved } = await setup();
    for (let i = 0; i < 5; i++) await send(app, valid).expect(200);
    const res = await send(app, valid);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: "too_many_messages" });
    await send(app, valid, "198.51.100.9").expect(200);
    expect(await saved()).toHaveLength(6);
  });

  it("drops unknown context fields and trims long ones", async () => {
    const { app, saved } = await setup();
    await send(app, { ...valid, context: { page: "p".repeat(600), secret: "x", boardId: 7 } }).expect(200);
    expect((await saved())[0].context).toEqual({ page: "p".repeat(500) });
  });
});

describe("GET /api/health", () => {
  it("says whether support email is set up", async () => {
    const plain = await setup();
    expect((await request(plain.app).get("/api/health")).body.modes.supportEmail).toBe("placeholder");
    const smtp = await setup(SMTP);
    expect((await request(smtp.app).get("/api/health")).body.modes.supportEmail).toBe("smtp");
  });
});
