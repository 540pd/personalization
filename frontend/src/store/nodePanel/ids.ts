let _nextId = 1;

/** A fresh `panel-N` id. */
export function nextPanelId(): string {
  return `panel-${_nextId++}`;
}

/** Keep _nextId ahead of every `panel-N` id in `panels`, so new ids never collide. */
export function bumpNextId(panels: { id: string }[]): void {
  const maxNum = panels.reduce((max, p) => {
    // String(p?.id): set-aside entries are unchecked saved data (#186).
    const n = Number(String(p?.id).replace("panel-", ""));
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  if (maxNum >= _nextId) _nextId = maxNum + 1;
}
