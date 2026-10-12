/**
 * Fixed-window counter per key, held in this instance's memory only. It slows down a single
 * client; it is not a distributed quota, so the provider-side spend limit remains the real cap.
 */
export function createRateLimiter(limit: number, windowMs: number, maxKeys = 5000) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function allow(key: string, now = Date.now()): number {
    if (hits.size >= maxKeys) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      if (hits.size >= maxKeys) hits.clear();
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return 0;
    }
    entry.count++;
    return entry.count > limit ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  };
}
