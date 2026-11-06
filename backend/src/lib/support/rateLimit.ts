// How many support messages one address may send (#428). In this process
// only: with several instances each counts its own, which is still a limit,
// and nothing here is worth a shared store.

/** Returns `allow(key)`: true, and counted, while `key` is under `limit` in `windowMs`. */
export function rateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return function allow(key: string): boolean {
    const t = now();
    // An occasional sweep, so addresses seen once don't pile up forever.
    if (hits.size > 10_000) {
      for (const [k, times] of hits) if (times.every((h) => t - h >= windowMs)) hits.delete(k);
    }
    const recent = (hits.get(key) ?? []).filter((h) => t - h < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    return true;
  };
}
