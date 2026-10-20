// What every generate route checks first: a model from its allow-list, a
// required instruction, the prompt's @agent / @skills, and optional named
// references. The routes differ only in their models and their options, which
// they still read themselves. Validated inline: no Zod (CLAUDE.md).

import type { AgentContext, Reference, SkillContext } from "../capabilities/types.js";
import { isNonEmptyString, isOneOf } from "../common/validation.js";
import { readMentionContext } from "./mentionContext.js";
import { readReferences } from "./references.js";

export interface GenerateRequestOptions {
  /** The route's model allow-list, from capabilities/models.ts. */
  models: ReadonlySet<string>;
  /**
   * Whether the route takes an @agent. An agent is a Prompt-panel setup, so
   * only /generate/text does; elsewhere `agent` in the body is ignored.
   */
  agent: boolean;
}

export type GenerateRequest =
  | {
      ok: true;
      modelId: string;
      /** Trimmed. */
      instruction: string;
      context: { agent?: AgentContext; skills?: SkillContext[] };
      references?: Reference[];
    }
  | { ok: false; message: string };

export function readGenerateRequest(body: unknown, options: GenerateRequestOptions): GenerateRequest {
  const { modelId, instruction, agent, skills, references } = (body ?? {}) as Record<string, unknown>;
  const models = [...options.models];

  if (!isOneOf(modelId, models)) {
    return { ok: false, message: `modelId must be one of: ${models.join(", ")}.` };
  }

  if (!isNonEmptyString(instruction)) {
    return { ok: false, message: "instruction is required." };
  }

  const context = readMentionContext(options.agent ? agent : undefined, skills);
  if (!context.ok) return { ok: false, message: context.message };

  return {
    ok: true,
    modelId,
    instruction: instruction.trim(),
    context: {
      ...(context.agent ? { agent: context.agent } : {}),
      ...(context.skills ? { skills: context.skills } : {}),
    },
    references: readReferences(references),
  };
}
