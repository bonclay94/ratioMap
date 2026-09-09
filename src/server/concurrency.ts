/** Shared by requests in one server/function instance; queued work is abortable. */
export class Semaphore {
  private active = 0;
  private queue: {
    resolve: () => void;
    reject: (reason: unknown) => void;
    signal?: AbortSignal;
    abort: () => void;
  }[] = [];
  constructor(private readonly limit: number) {}
  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (this.active >= this.limit) {
      await new Promise<void>((resolve, reject) => {
        const entry = {
          resolve,
          reject,
          signal,
          abort: () => {
            this.queue = this.queue.filter((item) => item !== entry);
            reject(signal?.reason);
          },
        };
        this.queue.push(entry);
        signal?.addEventListener('abort', entry.abort, { once: true });
      });
    } else this.active++;
    try {
      signal?.throwIfAborted();
      return await work();
    } finally {
      const next = this.queue.shift();
      if (next) {
        next.signal?.removeEventListener('abort', next.abort);
        next.resolve();
      } else this.active--;
    }
  }
}

export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        signal?.throwIfAborted();
        const index = cursor++;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
}
