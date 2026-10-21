"use client";

// The Instruction with @ mentions (#239). Still a textarea -- undo, copy,
// paste and the draft all work as before -- with two things around it:
//
// - a mirror behind it, laid out exactly like its text, that tints the
//   handles naming a skill or agent and marks where the menu opens;
// - the @ menu (MentionMenu), in a portal.
//
// Free of store imports, like GenerateForm: the lists arrive as props.

import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  insertMention,
  type Mention,
  type MentionAgent,
  type MentionItem,
  type Mentionables,
  type MentionScope,
} from "../../mentions/mentions";
import MentionMenu, { useMentionMenu } from "./MentionMenu";

export interface MentionInputProps {
  value: string;
  /** `agent` is set when the change picked one from the menu. */
  onChange: (next: string, agent?: MentionAgent) => void;
  onBlur: () => void;
  placeholder: string;
  className: string;
  /** Omitted: a plain textarea, no menu. */
  scope?: MentionScope;
  mentionables: Mentionables;
  /** Mentions that name a skill or agent, tinted. */
  known: readonly Mention[];
  /** The empty menu's links to the Skills and Agents pages. */
  onOpenLibrary?: (section: "skills" | "agents") => void;
}

export default function MentionInput({
  value, onChange, onBlur, placeholder, className, scope, mentionables, known, onOpenLibrary,
}: MentionInputProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const pendingCaret = useRef<number | null>(null);
  // The agent a pick chose, for the change event the insert fires.
  const pendingAgent = useRef<MentionAgent | undefined>(undefined);
  const menu = useMentionMenu(value, caret, scope, mentionables);
  const { active, items, hi, menuId } = menu;

  const syncCaret = () => {
    const ta = taRef.current;
    if (ta && document.activeElement === ta) setCaret(ta.selectionStart === ta.selectionEnd ? ta.selectionStart : null);
  };

  // A pick moves the caret past the inserted handle, once React has the text.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (ta && pendingCaret.current !== null) {
      ta.setSelectionRange(pendingCaret.current, pendingCaret.current);
      setCaret(pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value]);

  const pick = (item: MentionItem) => {
    const ta = taRef.current;
    if (!active || !ta) return;
    const next = insertMention(value, active.start, item.name);
    menu.setHighlight(0);
    // As typing, so Cmd+Z takes the insert back in one step. Where the
    // browser has no insertText (jsdom), set the value instead.
    pendingAgent.current = item.agent;
    ta.focus();
    ta.setSelectionRange(next.from, next.to);
    const inserted = typeof document.execCommand === "function" && document.execCommand("insertText", false, next.insert);
    if (!inserted) {
      pendingAgent.current = undefined;
      pendingCaret.current = next.caret;
      onChange(next.text, item.agent);
    }
  };

  // Mirror text: plain runs, tinted handles, and the menu's anchor: the
  // `@word` being typed, wrapped whole -- an empty marker before it would stay
  // at the end of the line above when the word wraps.
  const anchorAt = active ? active.start : -1;
  let anchorEnd = anchorAt;
  while (anchorAt >= 0 && anchorEnd < value.length && !/\s/.test(value[anchorEnd])) anchorEnd++;
  const pieces: ReactNode[] = [];
  let at = 0;
  const marks = [...known].sort((a, b) => a.start - b.start);
  const pushText = (from: number, to: number) => {
    if (from >= to) return;
    if (anchorAt >= from && anchorAt < to) {
      const end = Math.min(anchorEnd, to);
      pieces.push(
        value.slice(from, anchorAt),
        <span key="anchor" ref={anchorRef}>
          {value.slice(anchorAt, end)}
        </span>,
        value.slice(end, to),
      );
    } else {
      pieces.push(value.slice(from, to));
    }
  };
  for (const m of marks) {
    pushText(at, m.start);
    pieces.push(
      <mark key={m.start} ref={m.start === anchorAt ? anchorRef : undefined} className="mention-known">
        {value.slice(m.start, m.end)}
      </mark>,
    );
    at = m.end;
  }
  pushText(at, value.length);

  return (
    <div className="mention-field">
      <div ref={mirrorRef} className={`${className} mention-mirror`} aria-hidden>
        {pieces.map((p, i) => (
          <Fragment key={i}>{p}</Fragment>
        ))}
        {/* A trailing newline still takes a line, as it does in the textarea. */}
        {"​"}
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          setCaret(e.target.selectionStart);
          const agent = pendingAgent.current;
          pendingAgent.current = undefined;
          onChange(e.target.value, agent);
        }}
        onSelect={syncCaret}
        onKeyDown={(e) => menu.onKeyDown(e, pick)}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onFocus={syncCaret}
        onBlur={() => {
          setCaret(null);
          menu.reset();
          onBlur();
        }}
        onScroll={(e) => {
          if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        placeholder={placeholder}
        rows={3}
        className={`${className} mention-textarea`}
        role={scope ? "combobox" : undefined}
        aria-autocomplete={scope ? "list" : undefined}
        aria-expanded={scope ? !!active : undefined}
        aria-controls={active ? menuId : undefined}
        aria-activedescendant={active && items.length ? `${menuId}-${hi}` : undefined}
      />
      {active && (
        <MentionMenu
          menu={menu}
          anchorRef={anchorRef}
          value={value}
          caret={caret}
          onPick={pick}
          onOpenLibrary={onOpenLibrary}
        />
      )}
    </div>
  );
}
