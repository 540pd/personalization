"use client";

// What a node is asked to make, as a field of its form (#563): the label
// with an optional caption beside it, the text area, and the notes about its
// @ mentions. Props only. The @ menu, the tinting and the caret are
// MentionInput's, unchanged; this is the field around it.

import MentionInput, { type MentionInputProps } from "./MentionInput";

export interface InstructionFieldProps extends Omit<MentionInputProps, "className"> {
  /** A few words beside the label; none shows none. */
  caption?: string;
  /** What to tell the user about the mentions typed so far. */
  notes?: readonly string[];
}

export default function InstructionField({ caption, notes = [], ...input }: InstructionFieldProps) {
  return (
    <div className="instruction-field">
      <div className="instruction-field-heading">
        <p className="instruction-field-label">Instruction</p>
        {caption && <span className="instruction-field-caption">{caption}</span>}
      </div>
      <MentionInput {...input} className="node-panel-instruction" />
      {notes.length > 0 && (
        <div className="mention-notes">
          {notes.map((n) => (
            <p key={n} className="mention-note">
              {n}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
