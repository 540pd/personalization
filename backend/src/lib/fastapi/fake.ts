import { createHash, randomUUID } from "crypto";
import { FastApiError, type FastApiClient, type PublishStatus, type ServicePrincipal, type SkillRecord } from "./types.js";

// The placeholder FastAPI (#494): answers every operation from memory, per
// owner, shaped like the service in docs/aryash/GCOS-FastAPI-skills-main, so
// the Node side can be built and tested without it. Used when
// FASTAPI_BASE_URL is unset; a deployed backend refuses it (index.ts). It
// checks nothing the real service would (no Registry, catalog or quotas).

const APPROVED_TOOLS = new Set(["brand.read", "image.generate"]);

export function createFakeFastApiClient(): FastApiClient {
  const skills = new Map<string, SkillRecord & { owner: string }>();
  const jobs = new Map<string, string>(); // `${owner}:${idempotencyKey}` → jobId
  const publishes = new Map<string, PublishStatus & { owner: string; skillId: string; sha: string }>();

  const own = (principal: ServicePrincipal, skillId: string) => {
    const skill = skills.get(skillId);
    if (!skill || skill.owner !== principal.ownerKey) throw new FastApiError(404, "resource_not_accessible", "Not found.", false);
    return skill;
  };
  const view = ({ owner: _owner, ...record }: SkillRecord & { owner: string }): SkillRecord => ({ ...record });
  const now = () => new Date().toISOString();

  return {
    async createJob(principal, request) {
      const key = `${principal.ownerKey}:${request.idempotencyKey}`;
      if (!jobs.has(key)) jobs.set(key, `job_fake_${randomUUID()}`);
      return { status: "accepted", jobId: jobs.get(key)! };
    },
    async createSkill(principal, request) {
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
      if (!skill.latestPublishedRevision?.endsWith(`/${revisionId}`)) throw new FastApiError(404, "resource_not_accessible", "Not found.", false);
      return { name: skill.latestPublishedRevision };
    },
    async publishSkill(principal, skillId, publish) {
      const skill = own(principal, skillId);
      const unapproved = publish.toolNames.filter((t) => !APPROVED_TOOLS.has(t));
      if (unapproved.length) {
        throw new FastApiError(422, "tool_not_approved", "A tool in this Skill isn't approved.", false, unapproved.map((n, i) => ({ code: "tool_not_approved", path: `toolNames[${i}]`, message: `${n} isn't an approved tool.` })));
      }
      const operationId = createHash("sha256").update(`${principal.ownerKey}:${skillId}:${publish.idempotencyKey}`).digest("hex");
      const sha = createHash("sha256").update(publish.markdown).digest("hex");
      const known = publishes.get(operationId);
      if (known) {
        if (known.sha !== sha) throw new FastApiError(409, "conflict", "That Skill is busy, or this conflicts with an earlier request. Try again shortly.", false);
        const { owner: _o, skillId: _s, sha: _h, ...status } = known;
        return status;
      }
      const revision = `${skill.registryResource}/revisions/${publishes.size + 1}`;
      publishes.set(operationId, { operationId, status: "published", revision, error: null, owner: principal.ownerKey, skillId, sha });
      skill.latestPublishedRevision = revision;
      return { operationId, status: "published", revision, error: null };
    },
    async getPublishStatus(principal, skillId, operationId) {
      own(principal, skillId);
      const op = publishes.get(operationId);
      if (!op || op.owner !== principal.ownerKey || op.skillId !== skillId) throw new FastApiError(404, "resource_not_accessible", "Not found.", false);
      return { operationId: op.operationId, status: op.status, revision: op.revision, error: op.error };
    },
    async validateTools(_principal, toolNames) {
      const seen = new Set<string>();
      const results = toolNames.map((name) => {
        const dup = seen.has(name);
        seen.add(name);
        if (dup) return { name, approved: false, reason: "duplicate" };
        return APPROVED_TOOLS.has(name) ? { name, approved: true, reason: "approved by catalog" } : { name, approved: false, reason: "not in approved tool catalog" };
      });
      return { valid: results.every((r) => r.approved), results };
    },
    async draftSkill(_principal, request) {
      return {
        markdown: `---\nname: ${request.name.toLowerCase().replace(/ /g, "-")}\ndescription: ${request.goal.slice(0, 200)}\n---\n# Purpose\n${request.goal}\n`,
        approvedTools: request.approvedTools ?? [],
        warning: "Draft only; review and explicitly publish. No Registry write occurred.",
      };
    },
  };
}
