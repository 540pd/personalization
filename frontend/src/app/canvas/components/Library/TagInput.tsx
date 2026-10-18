"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { MAX_TAG, MAX_TAGS, normalizeTag } from "../../library/fields";

/**
 * Optional tags, as chips (#206, #208): Enter or comma adds, Backspace in an
 * empty input removes the last, × removes one. Typing suggests tags already
 * in use in the same library.
 */
export default function TagInput({
  id,
  tags,
  onChange,
  known,
}: {
  /** Prefix for the field's element ids; the input is `${id}-tags`. */
  id: string;
  tags: string[];
  onChange: (next: string[]) => void;
  /** Tags already in use, offered as suggestions. */
  known: string[];
}) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(-1);
  const [hidden, setHidden] = useState(false);

  // `tags` may be stale between two adds in one event (a paste of "a, b"),
  // so each add builds on the list the previous one produced.
  const addAll = (raws: string[]) => {
    let next = tags;
    for (const raw of raws) {
      const tag = normalizeTag(raw);
      if (tag && !next.includes(tag) && next.length < MAX_TAGS) next = [...next, tag];
    }
    if (next !== tags) onChange(next);
    setText("");
    setActive(-1);
  };

  const typed = normalizeTag(text);
  const suggestions =
    typed && !hidden ? known.filter((t) => t.startsWith(typed) && t !== typed && !tags.includes(t)).slice(0, 6) : [];
  const atLimit = tags.length >= MAX_TAGS;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addAll([active >= 0 ? suggestions[active] : text]);
    } else if (e.key === "Backspace" && !text && tags.length) {
      onChange(tags.slice(0, -1));
    } else if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape" && suggestions.length) {
      // The list closes; the dialog stays.
      e.stopPropagation();
      setHidden(true);
    }
  };

  return (
    <div className="library-tags-field">
      <label htmlFor={`${id}-tags`} className="library-field-label">
        Tags <span className="library-field-optional">(optional)</span>
      </label>
      <div className="library-tags-box">
        {tags.map((tag) => (
          <span key={tag} className="library-tag-chip">
            {tag}
            <button
              type="button"
              className="library-tag-remove"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            >
              <X size={11} strokeWidth={2.5} aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={`${id}-tags`}
          type="text"
          className="library-tags-input"
          placeholder={tags.length ? "" : "Type a tag and press Enter"}
          maxLength={MAX_TAG}
          readOnly={atLimit}
          value={text}
          onChange={(e) => {
            const value = e.target.value;
            setHidden(false);
            setActive(-1);
            // A pasted "a, b, c" becomes chips up to the last comma.
            if (value.includes(",")) {
              const parts = value.split(",");
              addAll(parts.slice(0, -1));
              setText(parts[parts.length - 1]);
            } else {
              setText(value);
            }
          }}
          onKeyDown={onKeyDown}
          onBlur={() => text.trim() && addAll([text])}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={`${id}-tag-suggestions`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-tag-${active}` : undefined}
          aria-describedby={`${id}-tags-hint`}
        />
      </div>
      <p id={`${id}-tags-hint`} className="library-field-hint">
        {atLimit ? `Up to ${MAX_TAGS} tags. Remove one to add another.` : `Enter or comma to add · up to ${MAX_TAGS} tags`}
      </p>
      {suggestions.length > 0 && (
        <ul id={`${id}-tag-suggestions`} role="listbox" aria-label="Matching tags" className="library-tag-suggestions">
          {suggestions.map((tag, i) => (
            <li
              key={tag}
              id={`${id}-tag-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "library-tag-suggestion library-tag-suggestion-active" : "library-tag-suggestion"}
              // mousedown, not click: the input's blur would add the typed text first.
              onMouseDown={(e) => {
                e.preventDefault();
                addAll([tag]);
              }}
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
