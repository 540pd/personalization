import { createHash, randomUUID } from "crypto";
import { idempotencyConflict, notFound, toolNotApproved, unapprovedTools } from "./errors.js";
import { assertNoOwnerField, assertOwner, assertPublishKey, pathSegment } from "./input.js";
import type { FastApiClient, PublishStatus, ServicePrincipal, SkillRecord } from "./types.js";

// The placeholder FastAPI (#494): answers every operation from memory, per
// owner, shaped like the service in docs/aryash/GCOS-FastAPI-skills-main, so
// the Node side can be built and tested without it. Used when
// FASTAPI_BASE_URL is unset; a deployed backend refuses it (index.ts). It
// checks nothing the real service would (no Registry, catalog or quotas).

const APPROVED_TOOLS = new Set(["brand.read", "image.generate"]);
const FAKE_CATALOG_REVISION = "fake-v1";

export function createFakeFastApiClient(): FastApiClient {
  const skills = new Map<string, SkillRecord & { owner: string }>();
  const jobs = new Map<string, string>(); // `${owner}:${idempotencyKey}` → jobId
  const publishes = new Map<string, PublishStatus & { owner: string; skillId: string; sha: string }>();

  // The client's input checks (#533): the fake refuses what the client refuses.
  const checked = (principal: ServicePrincipal, input?: unknown) => {
    assertOwner(principal);
    assertNoOwnerField(input);
  };
  const own = (principal: ServicePrincipal, skillId: string) => {
    checked(principal);
    pathSegment(skillId, "Skill ID"); // named as the client names the path's IDs
    const skill = skills.get(skillId);
    if (!skill || skill.owner !== principal.ownerKey) throw notFound();
    return skill;
  };
  const view = ({ owner: _owner, ...record }: SkillRecord & { owner: string }): SkillRecord => ({ ...record });
  const now = () => new Date().toISOString();

  return {
    async createJob(principal, request) {
      checked(principal, request);
      const key = `${principal.ownerKey}:${request.idempotencyKey}`;
      if (!jobs.has(key)) jobs.set(key, `job_fake_${randomUUID()}`);
      return { status: "accepted", jobId: jobs.get(key)! };
    },
    async createSkill(principal, request) {
      checked(principal, request);
      // As the service: the ID comes from owner + slug, so a retry finds the same Skill.
      const skillId = `${createHash("sha256").update(principal.ownerKey).digest("hex").slice(0, 12)}-${request.slug}`;
      if (!skills.has(skillId)) {
        skills.set(skillId, {
          skillId,
          status: "draft",
          latestPublishedRevision: null,
          registryResource: `projects/fake/locations/us/skills/private-gcos-${skillId}`,
          createdAt: now(),
          updatedAt: now(),
          owner: principal.ownerKey,
        });
      }
      return view(own(principal, skillId));
    },
    async listSkills(principal) {
      checked(principal);
      return { skills: [...skills.values()].filter((s) => s.owner === principal.ownerKey).map(view) };
    },
    async getSkill(principal, skillId) {
      return view(own(principal, skillId));
    },
    async updateSkill(principal, skillId) {
      own(principal, skillId).updatedAt = now();
      return { status: "updated", operation: null };
    },
    async disableSkill(principal, skillId) {
      own(principal, skillId).status = "disable_requested";
      return { status: "disable_requested", operation: null };
    },
    async listRevisions(principal, skillId) {
      const skill = own(principal, skillId);
      return { revisions: skill.latestPublishedRevision ? [{ name: skill.latestPublishedRevision }] : [] };
    },
    async getRevision(principal, skillId, revisionId) {
      const skill = own(principal, skillId);
      pathSegment(revisionId, "ID");
      if (!skill.latestPublishedRevision?.endsWith(`/${revisionId}`)) throw notFound();
      return { name: skill.latestPublishedRevision };
    },
    async publishSkill(principal, skillId, publish) {
      assertPublishKey(publish.idempotencyKey);
      const skill = own(principal, skillId);
      const unapproved = publish.toolNames.filter((t) => !APPROVED_TOOLS.has(t));
      if (unapproved.length) {
        throw toolNotApproved(unapprovedTools(unapproved));
      }
      const operationId = createHash("sha256").update(`${principal.ownerKey}:${skillId}:${publish.idempotencyKey}`).digest("hex");
      const sha = createHash("sha256").update(publish.markdown).digest("hex");
      const known = publishes.get(operationId);
      if (known) {
        // As the service: the same key with other content is an idempotency conflict (#533).
        if (known.sha !== sha) throw idempotencyConflict();
        const { owner: _o, skillId: _s, sha: _h, ...status } = known;
        return status;
      }
      const revision = `${skill.registryResource}/revisions/${publishes.size + 1}`;
      publishes.set(operationId, { operationId, status: "published", revision, error: null, catalogRevision: FAKE_CATALOG_REVISION, owner: principal.ownerKey, skillId, sha });
      skill.latestPublishedRevision = revision;
      return { operationId, status: "published", revision, error: null, catalogRevision: FAKE_CATALOG_REVISION };
    },
    async getPublishStatus(principal, skillId, operationId) {
      own(principal, skillId);
      pathSegment(operationId, "ID");
      const op = publishes.get(operationId);
      if (!op || op.owner !== principal.ownerKey || op.skillId !== skillId) throw notFound();
      return { operationId: op.operationId, status: op.status, revision: op.revision, error: op.error, catalogRevision: FAKE_CATALOG_REVISION };
    },
    async validateTools(principal, toolNames) {
      checked(principal);
      const seen = new Set<string>();
      const results = toolNames.map((name) => {
        const dup = seen.has(name);
        seen.add(name);
        if (dup) return { name, approved: false, reason: "duplicate" };
        return APPROVED_TOOLS.has(name) ? { name, approved: true, reason: "approved by catalog" } : { name, approved: false, reason: "not in approved tool catalog" };
      });
      return { valid: results.every((r) => r.approved), results, catalogRevision: FAKE_CATALOG_REVISION };
    },
    async draftSkill(principal, request) {
      checked(principal, request);
      return {
        markdown: `---\nname: ${request.name.toLowerCase().replace(/ /g, "-")}\ndescription: ${request.goal.slice(0, 200)}\n---\n# Purpose\n${request.goal}\n`,
        approvedTools: request.approvedTools ?? [],
        warning: "Draft only; review and explicitly publish. No Registry write occurred.",
      };
    },
  };
}
