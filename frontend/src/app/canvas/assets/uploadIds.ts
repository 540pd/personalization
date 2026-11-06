// An upload shows at once under a temporary id and takes the stored asset's
// id once it lands (#415). What the page keeps by id follows it (#462).

export const newTempId = () => `tmp-${crypto.randomUUID()}`;

/**
 * `record` with `to` given what `from` had, or `record` itself when `from`
 * has nothing. `from` keeps its entry: a late render may still ask for it.
 */
export function rekey<T>(record: Record<string, T>, from: string, to: string): Record<string, T> {
  return from in record ? { ...record, [to]: record[from] } : record;
}

/** `selected` with every `from` replaced by `to`, or `selected` itself. */
export function rekeySelected<K extends string>(
  selected: Record<K, string | null>,
  from: string,
  to: string,
): Record<K, string | null> {
  const keys = (Object.keys(selected) as K[]).filter((k) => selected[k] === from);
  if (!keys.length) return selected;
  const next = { ...selected };
  for (const k of keys) next[k] = to;
  return next;
}
