import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DRAFT, draftErrors, firstError, type SupportDraft } from "../supportDraft";
import { sendSupportMessage } from "../support.api";
import { useSupport } from "../useSupport";

// The support form's checks, its call, and its draft (#428).

const good: SupportDraft = {
  name: "Priya Sharma",
  email: "priya@company.test",
  clientProject: false,
  message: "The generator keeps failing on my board.",
};

const fetchMock = vi.fn<typeof fetch>();
const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(reply(200, { ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  useSupport.setState({ draft: EMPTY_DRAFT, status: "editing", checked: false, sentFrom: null });
});

afterEach(() => vi.unstubAllGlobals());

describe("draftErrors", () => {
  it("names every missing field, in order", () => {
    const errors = draftErrors(EMPTY_DRAFT);
    expect(errors).toEqual({
      name: "Enter your name.",
      email: "Enter your email address.",
      clientProject: "Choose Yes or No.",
      message: "Tell us a bit more: at least 10 characters.",
    });
    expect(firstError(errors)).toBe("name");
  });

  it("checks the email's shape and the message's length, after trimming", () => {
    expect(draftErrors({ ...good, email: "priya@" }).email).toBe("Enter a full email address, like name@company.com.");
    expect(draftErrors({ ...good, message: "  Help me   " }).message).toMatch(/at least 10/);
    expect(draftErrors({ ...good, message: "x".repeat(5001) }).message).toMatch(/5,000/);
    expect(draftErrors({ ...good, name: "x".repeat(101) }).name).toMatch(/100/);
    expect(firstError(draftErrors({ ...good, clientProject: null }))).toBe("clientProject");
  });

  it("finds nothing wrong with a complete draft; No is an answer", () => {
    expect(draftErrors(good)).toEqual({});
  });
});

describe("sendSupportMessage", () => {
  it("posts the trimmed draft, its context and the hidden field through the proxy", async () => {
    await sendSupportMessage({ ...good, name: " Priya Sharma " }, { page: "Playspace" }, "");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/proxy/support");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ ...good, context: { page: "Playspace" }, website: "" });
  });

  it("reads 429 as the limit, anything else failing as worth trying again", async () => {
    fetchMock.mockResolvedValueOnce(reply(429));
    expect(await sendSupportMessage(good, {})).toEqual({ ok: false, kind: "limit" });
    fetchMock.mockResolvedValueOnce(reply(500));
    expect(await sendSupportMessage(good, {})).toEqual({ ok: false, kind: "failed" });
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await sendSupportMessage(good, {})).toEqual({ ok: false, kind: "failed" });
  });
});

describe("useSupport", () => {
  it("doesn't send an incomplete draft: it marks the errors and answers null", async () => {
    expect(await useSupport.getState().submit({})).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useSupport.getState()).toMatchObject({ checked: true, status: "editing" });
  });

  it("sent: clears the draft and remembers who it was from; startOver opens a fresh form", async () => {
    useSupport.setState({ draft: good });
    expect(await useSupport.getState().submit({})).toEqual({ ok: true });
    expect(useSupport.getState()).toMatchObject({
      status: "sent",
      draft: EMPTY_DRAFT,
      checked: false,
      sentFrom: { name: "Priya Sharma", email: "priya@company.test" },
    });
    useSupport.getState().startOver();
    expect(useSupport.getState()).toMatchObject({ status: "editing", sentFrom: null });
  });

  it("failed or limited: keeps the draft", async () => {
    useSupport.setState({ draft: good });
    fetchMock.mockResolvedValueOnce(reply(503));
    await useSupport.getState().submit({});
    expect(useSupport.getState()).toMatchObject({ status: "failed", draft: good });
    fetchMock.mockResolvedValueOnce(reply(429));
    await useSupport.getState().submit({});
    expect(useSupport.getState()).toMatchObject({ status: "limit", draft: good });
  });

  it("never sends twice at once", async () => {
    useSupport.setState({ draft: good });
    const first = useSupport.getState().submit({});
    expect(await useSupport.getState().submit({})).toBeNull();
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("startOver leaves an unsent draft alone", () => {
    useSupport.setState({ draft: good, status: "failed" });
    useSupport.getState().startOver();
    expect(useSupport.getState()).toMatchObject({ status: "failed", draft: good });
  });
});
