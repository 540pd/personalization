// Names that end up inside a model prompt: a connected node's, an agent's, a
// skill's. They are user-supplied, so they are bounded and stripped of
// control characters; and a name is one line, so any run of whitespace -- a
// tab, a newline, a double space -- becomes one space. One rule for all of
// them, so a name reads the same wherever a prompt mentions it (#303).
// Bodies (a text reference, an agent's instructions, a skill) are not names:
// their newlines matter, and their callers clean them their own way.

export const MAX_PROMPT_NAME = 60;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** `name` as it may appear in a prompt; empty when nothing is left of it. */
export function cleanPromptName(name: string): string {
  return name.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT_NAME);
}
