import { describe, expect, it } from "vitest";
import { errorFrom, malformed, requestIdOf } from "../fastapi/errors.js";
import type { HttpResponse } from "../fastapi/transport.js";
import {
  MalformedAnswer,
  createdJobId,
  fromWire,
  publishStatus,
  skillDraft,
  skillList,
  skillOperation,
  skillRecord,
  toWire,
  toolCheck,
} from "../fastapi/wire.js";

// The client's two contracts on their own (#532): the wire format, and the
// service's error answers. fastapiClient.test.ts covers them through calls.

const res = (status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse => ({
  status,
  headers,
  body: typeof body === "string" ? body : JSON.stringify(body),
});

describe("wire.ts", () => {
  it("maps keys both ways, deeply", () => {
    expect(toWire({ toolNames: ["a"], nested: [{ displayName: "x" }] })).toEqual({ tool_names: ["a"], nested: [{ display_name: "x" }] });
    expect(fromWire({ operation_id: "op", results: [{ catalog_revision: "r" }] })).toEqual({ operationId: "op", results: [{ catalogRevision: "r" }] });
  });

  it("trims a Skill row to Node's fields, dropping the owner key and hashes", () => {
    const row = { skillId: "s", status: "draft", ownerKey: "usr_ana", createHash: "h", registryResource: "r" };
    expect(skillRecord(row)).toEqual({ skillId: "s", status: "draft", latestPublishedRevision: null, registryResource: "r", createdAt: null, updatedAt: null });
  });

  it.each([
    ["skillRecord", () => skillRecord({ status: "draft" })],
    ["skillList", () => skillList({})],
    ["publishStatus with an unknown state", () => publishStatus({ operationId: "op", status: "done" })],
    ["toolCheck", () => toolCheck({ valid: "yes", results: [] })],
    ["skillDraft", () => skillDraft({})],
    ["createdJobId", () => createdJobId({ jobId: "" })],
  ])("refuses a malformed %s", (_label, parse) => {
    expect(parse).toThrow(MalformedAnswer);
  });

  it("reads the rest of the answers", () => {
    expect(skillOperation({ status: "pending", operation: "ops/1", extra: 1 })).toEqual({ status: "pending", operation: "ops/1" });
    expect(toolCheck({ valid: true, results: [{ name: "brand.read", approved: true, reason: "ok" }], catalogRevision: "r" })).toEqual({
      valid: true,
      results: [{ name: "brand.read", approved: true, reason: "ok" }],
      catalogRevision: "r",
    });
    expect(skillDraft({ markdown: "# x", approvedTools: ["a"], warning: "w" })).toEqual({ markdown: "# x", approvedTools: ["a"], warning: "w" });
    expect(createdJobId({ jobId: "job-1" })).toBe("job-1");
  });
});

describe("errors.ts", () => {
  it("prefers the error body's request ID, then the header, and only a safe one", () => {
    expect(requestIdOf(res(404, {}, { "x-request-id": "hdr-12345678" }), { requestId: "body-1234567" })).toBe("body-1234567");
    expect(requestIdOf(res(404, {}, { "x-request-id": "hdr-12345678" }))).toBe("hdr-12345678");
    expect(requestIdOf(res(404, {}, { "x-request-id": "bad id" }))).toBeUndefined();
  });

  it("parses the body once and reads code, issues and context from it", () => {
    const e = errorFrom(
      res(422, {
        error: { code: "tool_not_approved", requestId: "fa-req-12345678", catalogRevision: "file-v1-a", issues: [{ code: "tool_not_approved", tool: "shell.exec" }] },
      })
    );
    expect(e).toMatchObject({ status: 422, code: "tool_not_approved", context: { requestId: "fa-req-12345678", catalogRevision: "file-v1-a" } });
    expect(e.issues).toEqual([{ code: "tool_not_approved", path: "toolNames[0]", message: "shell.exec isn't an approved tool." }]);
  });

  it("treats a body that isn't JSON as no detail", () => {
    expect(errorFrom(res(404, "<html>"))).toMatchObject({ status: 404, code: "resource_not_accessible" });
  });

  it("names a broken service without upstream text", () => {
    expect(malformed()).toMatchObject({ status: 502, code: "dependency_unavailable", retryable: false });
  });
});
