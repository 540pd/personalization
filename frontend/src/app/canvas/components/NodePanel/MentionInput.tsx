"use client";

// The Instruction with @ mentions (#239). Still a textarea -- undo, copy,
// paste and the draft all work as before -- with two things around it:
//
// - a mirror behind it, laid out exactly like its text, that tints the
//   handles naming a skill or agent and marks where the menu opens;
// - the @ menu, in a portal: the form is translated, which would make a
//   fixed menu inside it position against the form instead of the window.
//
// Free of store imports, like GenerateForm: the lists arrive as props.

import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Z_INDEX } from "@/constants/canvas.constants";
import {
  activeMention,
  insertMention,
  menuItems,
  type Mention,
  type MentionAgent,
  type Mentionables,
  type MentionScope,
} from "../../mentions/mentions";

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

type Item = { kind: "skill" | "agent"; id: string; name: string; description: string; agent?: MentionAgent };

const MENU_ID = "mention-menu";
/** .mention-menu's w-64, before it has rendered once. */
const MENU_WIDTH = 256;

export default function MentionInput({
  value, onChange, onBlur, placeholder, className, scope, mentionables, known, onOpenLibrary,
}: MentionInputProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [highlight, setHighlight] = useState(0);
  // The @ an Esc closed the menu for: it stays closed until another @.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const pendingCaret = useRef<number | null>(null);
  // The agent a pick chose, for the change event the insert fires.
  const pendingAgent = useRef<MentionAgent | undefined>(undefined);

  const active = scope && caret !== null ? activeMention(value, caret) : null;
  const open = !!active && active.start !== dismissed;
  const lists = open
    ? menuItems(active.query, mentionables.skills, mentionables.agents, scope!)
    : { skills: [], agents: [] };
  const items: Item[] = [
    ...lists.skills.map((s) => ({ kind: "skill" as const, id: s.id, name: s.name, description: s.description })),
    ...lists.agents.map((a) => ({ kind: "agent" as const, id: a.id, name: a.name, description: a.description, agent: a })),
  ];
  const hi = Math.min(highlight, Math.max(0, items.length - 1));
  const libraryEmpty =
    !mentionables.skills.length && (scope !== "skills-and-agents" || !mentionables.agents.length);

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

  // The menu sits under the @, wherever the text has wrapped or scrolled to.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setMenuPos(null);
      return;
    }
    const r = anchorRef.current.getBoundingClientRect();
    // Kept in the window: flipped above the @ when there's no room below.
    const menu = document.getElementById(MENU_ID)?.getBoundingClientRect();
    const w = menu?.width ?? MENU_WIDTH;
    const h = menu?.height ?? 0;
    const below = r.bottom + 4;
    setMenuPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
      top: below + h > window.innerHeight - 8 && r.top - 4 - h > 8 ? r.top - 4 - h : below,
    });
  }, [open, value, caret]);

  const pick = (item: Item) => {
    const ta = taRef.current;
    if (!active || !ta) return;
    const next = insertMention(value, active.start, item.name);
    setHighlight(0);
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((hi + step + items.length) % items.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && items.length && !e.shiftKey) {
      // Never a submit or a newline while the menu offers something.
      e.preventDefault();
      pick(items[hi]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setDismissed(active.start);
    }
  };

  // Mirror text: plain runs, tinted handles, and the menu's anchor: the
  // `@word` being typed, wrapped whole -- an empty marker before it would stay
  // at the end of the line above when the word wraps.
  const anchorAt = open ? active.start : -1;
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

  let group: Item["kind"] | null = null;

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
        onKeyDown={onKeyDown}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onFocus={syncCaret}
        onBlur={() => {
          setCaret(null);
          setDismissed(null);
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
        aria-expanded={scope ? open : undefined}
        aria-controls={open ? MENU_ID : undefined}
        aria-activedescendant={open && items.length ? `${MENU_ID}-${hi}` : undefined}
      />
      {open &&
        menuPos &&
        createPortal(
          <div
            id={MENU_ID}
            role="listbox"
            aria-label={scope === "skills-and-agents" ? "Skills and agents" : "Skills"}
            className="mention-menu"
            style={{ left: menuPos.left, top: menuPos.top, zIndex: Z_INDEX.mentionMenu }}
            // Keeps focus in the textarea, so the caret and the menu survive a click.
            onMouseDown={(e) => e.preventDefault()}
          >
            {items.map((item, i) => {
              const heading = item.kind !== group;
              group = item.kind;
              return (
                <Fragment key={`${item.kind}-${item.id}`}>
                  {heading && (
                    <div className="mention-menu-group" role="presentation">
                      {item.kind === "skill" ? "Skills" : "Agents"}
                    </div>
                  )}
                  <div
                    id={`${MENU_ID}-${i}`}
                    role="option"
                    aria-selected={i === hi}
                    className={`mention-menu-item ${i === hi ? "mention-menu-item-active" : ""}`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(item)}
                  >
                    <span className="mention-menu-name">{item.name}</span>
                    {item.description && <span className="mention-menu-description">{item.description}</span>}
                  </div>
                </Fragment>
              );
            })}
            {!items.length &&
              (libraryEmpty ? (
                <div className="mention-menu-empty">
                  No {scope === "skills-and-agents" ? "skills or agents" : "skills"} yet.{" "}
                  {onOpenLibrary && (
                    <>
                      <button type="button" className="mention-menu-link" onClick={() => onOpenLibrary("skills")}>
                        Skills
                      </button>
                      {scope === "skills-and-agents" && (
                        <>
                          {" · "}
                          <button type="button" className="mention-menu-link" onClick={() => onOpenLibrary("agents")}>
                            Agents
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="mention-menu-empty">
                  No {scope === "skills-and-agents" ? "skills or agents" : "skills"} match “{active.query}”
                </div>
              ))}
            {items.length > 0 && <div className="mention-menu-foot">↑↓ to move · Enter or Tab to insert · Esc</div>}
          </div>,
          document.body,
        )}
    </div>
  );
}
