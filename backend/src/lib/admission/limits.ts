// Run admission limits (#493). Defaults are today's numbers where the code
// already has one, so turning admission on changes nothing; the pack's own
// numbers (docs/aryash 01_FROZEN_ARCHITECTURE_RULES.md, "Existing reference
// limits") are noted beside each. Lowering to them is a switch-on decision.

export interface RunLimits {
  /** Reference images per Run. Pack: 5 (1 main + 4). The code has no cap today. */
  maxAssets: number;
  /** Bytes per reference image. Pack: 10 MiB. Today: 25 MiB per asset (assets/types.ts). */
  maxAssetBytes: number;
  /** Skills per Run. Pack: 5. Today: 20 (mentionContext.ts). */
  maxSkills: number;
  /** Bytes per Skill. Pack and today: 100 KiB. */
  maxSkillBytes: number;
  /** All Skills together. Pack: 300 KiB. Today: 400 KB with the agent (mentionContext.ts). */
  maxSkillsTotalBytes: number;
  /** The instruction. Pack: a 30,000-character effective budget. */
  maxInstructionChars: number;
  /** Output images per Run. Pack and today: 1–10 (generate.ts). */
  maxCount: number;
  /** Parent jobs per Run. Not in the pack; bounded so a request stays small. */
  maxParents: number;
}

export const DEFAULT_RUN_LIMITS: RunLimits = {
  maxAssets: 5,
  maxAssetBytes: 25 * 1024 * 1024,
  maxSkills: 20,
  maxSkillBytes: 100 * 1024,
  maxSkillsTotalBytes: 400 * 1024,
  maxInstructionChars: 30_000,
  maxCount: 10,
  maxParents: 10,
};

/** Image types a reference may be. Pack: PNG, JPEG, WebP. */
export const REFERENCE_MIME_TYPES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/webp"]);

const VARS: Record<keyof RunLimits, string> = {
  maxAssets: "RUN_MAX_ASSETS",
  maxAssetBytes: "RUN_MAX_ASSET_BYTES",
  maxSkills: "RUN_MAX_SKILLS",
  maxSkillBytes: "RUN_MAX_SKILL_BYTES",
  maxSkillsTotalBytes: "RUN_MAX_SKILLS_TOTAL_BYTES",
  maxInstructionChars: "RUN_MAX_INSTRUCTION_CHARS",
  maxCount: "RUN_MAX_COUNT",
  maxParents: "RUN_MAX_PARENTS",
};

/** The limits, each overridable by its RUN_MAX_* variable; a bad value throws. */
export function runLimits(env: NodeJS.ProcessEnv = process.env): RunLimits {
  const limits = { ...DEFAULT_RUN_LIMITS };
  for (const key of Object.keys(VARS) as (keyof RunLimits)[]) {
    const text = env[VARS[key]]?.trim();
    if (!text) continue;
    const value = Number(text);
    if (!Number.isInteger(value) || value < 1) throw new Error(`${VARS[key]} must be a whole number from 1, got "${text}".`);
    limits[key] = value;
  }
  if (limits.maxCount > 10) throw new Error("RUN_MAX_COUNT can't be more than 10 (the pack's output limit).");
  return limits;
}
