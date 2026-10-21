"use client";

// A library page's search and tag filter, and the state behind them.

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

/** Search, tag chips (All + each tag, one at a time) and the match count. */
export function LibraryToolbar({
  query,
  onQuery,
  searchLabel,
  tags,
  tag,
  onTag,
  count,
}: {
  query: string;
  onQuery: (q: string) => void;
  searchLabel: string;
  tags: string[];
  tag: string | null;
  onTag: (tag: string | null) => void;
  /** Already worded: "4 skills", "1 agent". */
  count: string;
}) {
  return (
    <div className="library-toolbar">
      <div className="library-search">
        <Search size={14} aria-hidden />
        <input
          type="search"
          className="library-search-input"
          placeholder="Search name or description"
          aria-label={searchLabel}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      {tags.length > 0 && (
        <div className="library-tag-filter" role="group" aria-label="Filter by tag">
          <span className="library-tag-filter-label" aria-hidden>
            Tags
          </span>
          <button
            type="button"
            className={tag === null ? "library-filter-chip library-filter-chip-on" : "library-filter-chip"}
            aria-pressed={tag === null}
            onClick={() => onTag(null)}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className={tag === t ? "library-filter-chip library-filter-chip-on" : "library-filter-chip"}
              aria-pressed={tag === t}
              onClick={() => onTag(tag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <span className="library-count" aria-live="polite">
        {count}
      </span>
    </div>
  );
}

/**
 * Query and tag filter state, with the tag dropped once no item has it any
 * more -- a filter on it would match nothing, silently.
 */
export function useLibraryFilters(tags: string[]) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  useEffect(() => {
    if (tag && !tags.includes(tag)) setTag(null);
  }, [tag, tags]);
  return {
    query,
    setQuery,
    tag,
    setTag,
    clear: () => {
      setQuery("");
      setTag(null);
    },
  };
}
