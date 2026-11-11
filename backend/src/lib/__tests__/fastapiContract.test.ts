import { describe, expect, it } from "vitest";
import { createFastApiClient } from "../fastapi/client.js";
import { DEFAULT_TIMEOUTS_MS, type FastApiConfig } from "../fastapi/config.js";
import { createFakeFastApiClient } from "../fastapi/fake.js";
import type { HttpRequest, HttpResponse } from "../fastapi/transport.js";
import { FastApiError, type FastApiClient } from "../fastapi/types.js";

// The fake and the real client answer the same cases with the same errors
// (#533). The real client runs over a transport that answers as the service
// does (its #512 error shape); the fake answers from memory.

const BASE = "https://fastapi.example.run.app";
const config: FastApiConfig = { baseUrl: BASE, audience: BASE, timeoutsMs: { ...DEFAULT_TIMEOUTS_MS }, maxResponseBytes: 64 * 1024 };
const ANA = { ownerKey: "usr_ana" };
const BEN = { ownerKey: "usr_ben" };
const MD = "---\nname: brand-tone\ndescription: Applies the brand voice.\n---\n# Purpose\nShort copy.\n";

const json = (status: number, body: unknown): HttpResponse => ({ status, headers: {}, body: JSON.stringify(body) });
const fail = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  json(status, { error: { code, message: "service text", requestId: "fa-req-12345678", retryable: false, ...extra } });

/** Just enough of the service for these cases, answering in its own shape. */
function scriptedService() {
  const skills = new Map<string, string>(); // skillId → owner
  const publishes = new Map<string, string>(); // key → markdown
  return async (req: HttpRequest): Promise<HttpResponse> => {
    const owner = req.headers["X-Owner-Key"];
    const path = new URL(req.url).pathname;
    const body = req.body ? JSON.parse(req.body) : {};
    if (req.method === "POST" && path === "/v1/skills") {
      const skillId = `${owner}-${body.slug}`;
      skills.set(skillId, owner);
      return json(202, { skillId, status: "draft", ownerKey: owner });
    }
    const id = path.split("/")[3];
    if (skills.get(id) !== owner) return fail(404, "resource_not_accessible");
    if (path.endsWith("/publish")) {
      const unapproved = (body.tool_names as string[]).filter((t) => t !== "brand.read");
      if (unapproved.length) return fail(422, "tool_not_approved", { issues: unapproved.map((tool) => ({ code: "tool_not_approved", path: "tool_names", tool, message: "x" })) });
      const key = req.headers["Idempotency-Key"];
      if (publishes.has(key) && publishes.get(key) !== body.markdown) return fail(409, "idempotency_conflict");
      publishes.set(key, body.markdown);
      return json(200, { operation_id: key, status: "published", revision: "r", error: null, catalog_revision: "file-v1-a" });
    }
    return json(200, { skillId: id, status: "draft" });
  };
}

const real = () => createFastApiClient({ config, tokens: { token: async () => "service-token" }, transport: scriptedService(), sleep: async () => {} });
const clients: [string, () => FastApiClient][] = [
  ["fake", createFakeFastApiClient],
  ["real client", real],
];

/** The error a call ends with, as the fields a caller can see. */
async function failure(call: Promise<unknown>) {
  const e = await call.then(
    () => null,
    (x: unknown) => x
  );
  expect(e).toBeInstanceOf(FastApiError);
  const { status, code, message, retryable, issues } = e as FastApiError;
  return { status, code, message, retryable, issues };
}

async function cases(client: FastApiClient) {
  const refusedInput = {
    "a malformed owner key": await failure(client.listSkills({ ownerKey: "ana" })),
    "an owner field in the input": await failure(client.createSkill(ANA, { slug: "x", displayName: "X", description: "x", ownerKey: "usr_ben" } as never)),
    "a path-walking ID": await failure(client.getSkill(ANA, "..")),
  };
  const skill = await client.createSkill(ANA, { slug: "brand-tone", displayName: "Brand Tone", description: "Applies the brand voice." });
  const publish = { markdown: MD, toolNames: ["brand.read"], idempotencyKey: "key-12345678" };
  await client.publishSkill(ANA, skill.skillId, publish);
  return {
    "another owner's Skill": await failure(client.getSkill(BEN, skill.skillId)),
    "the same key with other content": await failure(client.publishSkill(ANA, skill.skillId, { ...publish, markdown: MD + "\nMore\n" })),
    "an unapproved tool": await failure(client.publishSkill(ANA, skill.skillId, { ...publish, toolNames: ["shell.exec", "net.fetch"], idempotencyKey: "key-87654321" })),
    "an invalid publish key": await failure(client.publishSkill(ANA, skill.skillId, { ...publish, idempotencyKey: "short" })),
    ...refusedInput,
  };
}

describe("the fake answers with the real client's errors (#533)", () => {
  it("has the same errors for the same cases", async () => {
    const [fake, client] = await Promise.all(clients.map(([, make]) => cases(make())));
    expect(fake).toEqual(client);
    expect(client["the same key with other content"].code).toBe("idempotency_conflict");
    expect(client["an unapproved tool"].issues).toEqual([
      { code: "tool_not_approved", path: "toolNames[0]", message: "shell.exec isn't an approved tool." },
      { code: "tool_not_approved", path: "toolNames[1]", message: "net.fetch isn't an approved tool." },
    ]);
    expect(client["an invalid publish key"]).toMatchObject({ status: 422, code: "validation_failed", message: "The publish key isn't valid." });
  });
});
