"use client";

// The @ menu of MentionInput (#239): which @ it is open for, its rows and
// highlight, its keys, and the listbox itself. In a portal: the form is
// translated, which would make a fixed menu inside it position against the
// form instead of the window.

import { Fragment, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Z_INDEX } from "@/constants/canvas.constants";
import {
  activeMention,
  menuItems,
  menuKey,
  type MentionItem,
  type Mentionables,
  type MentionScope,
} from "../../mentions/mentions";

/** .mention-menu's w-64, before it has rendered once. */
const MENU_WIDTH = 256;

export function useMentionMenu(value: string, caret: number | null, scope: MentionScope | undefined, mentionables: Mentionables) {
  // Per field, so two open forms cannot share the menu's id or each other's
  // aria-controls target.
  const menuId = `mention-menu${useId()}`;
  const [highlight, setHighlight] = useState(0);
  // The @ an Esc closed the menu for: it stays closed until another @.
  const [dismissed, setDismissed] = useState<number | null>(null);

  const active = scope && caret !== null ? activeMention(value, caret) : null;
  const open = !!active && active.start !== dismissed;
  const items = open ? menuItems(active.query, mentionables, scope!) : [];
  const hi = Math.min(highlight, Math.max(0, items.length - 1));
  const both = scope === "skills-and-agents";
  const libraryEmpty = !mentionables.skills.length && (!both || !mentionables.agents.length);

  /** Handles the key if it is the menu's; `pick` inserts a row. */
  const onKeyDown = (e: React.KeyboardEvent, pick: (item: MentionItem) => void) => {
    if (!open) return;
    const action = menuKey(e.key, e.shiftKey, hi, items.length);
    if (action === null) return;
    e.preventDefault();
    if (action === "pick") pick(items[hi]);
    else if (action === "dismiss") {
      e.stopPropagation();
      setDismissed(active.start);
    } else setHighlight(action);
  };

  return {
    menuId, active: open ? active : null, items, hi, setHighlight, onKeyDown, both, libraryEmpty,
    /** Leaving the field forgets the Esc, so the next @ there opens again. */
    reset: () => setDismissed(null),
  };
}

export type MentionMenuState = ReturnType<typeof useMentionMenu>;

interface MentionMenuProps {
  menu: MentionMenuState;
  /** The `@word` in the mirror the menu sits under. */
  anchorRef: RefObject<HTMLElement | null>;
  /** What moves the anchor: the text and the caret. */
  value: string;
  caret: number | null;
  onPick: (item: MentionItem) => void;
  onOpenLibrary?: (section: "skills" | "agents") => void;
}

/** Rendered while the menu is open. */
export default function MentionMenu({
  menu: { menuId, active, items, hi, setHighlight, both, libraryEmpty }, anchorRef, value, caret, onPick, onOpenLibrary,
}: MentionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  // The menu sits under the @, wherever the text has wrapped or scrolled to.
  useLayoutEffect(() => {
    if (!anchorRef.current) {
      setMenuPos(null);
      return;
    }
    const r = anchorRef.current.getBoundingClientRect();
    // Kept in the window: flipped above the @ when there's no room below.
    const menu = menuRef.current?.getBoundingClientRect();
    const w = menu?.width ?? MENU_WIDTH;
    const h = menu?.height ?? 0;
    const below = r.bottom + 4;
    setMenuPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
      top: below + h > window.innerHeight - 8 && r.top - 4 - h > 8 ? r.top - 4 - h : below,
    });
  }, [anchorRef, value, caret]);

  if (!active || !menuPos) return null;
  let group: MentionItem["kind"] | null = null;

  return createPortal(
    <div
      ref={menuRef}
      id={menuId}
      role="listbox"
      aria-label={both ? "Skills and agents" : "Skills"}
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
              id={`${menuId}-${i}`}
              role="option"
              aria-selected={i === hi}
              className={`mention-menu-item ${i === hi ? "mention-menu-item-active" : ""}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => onPick(item)}
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
            No {both ? "skills or agents" : "skills"} yet.{" "}
            {onOpenLibrary && (
              <>
                <button type="button" className="mention-menu-link" onClick={() => onOpenLibrary("skills")}>
                  Skills
                </button>
                {both && (
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
            No {both ? "skills or agents" : "skills"} match “{active.query}”
          </div>
        ))}
      {items.length > 0 && <div className="mention-menu-foot">↑↓ to move · Enter or Tab to insert · Esc</div>}
    </div>,
    document.body,
  );
}
