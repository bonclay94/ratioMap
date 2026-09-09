import { randomBytes } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { HttpError } from './errors';

export interface ShortLinkStore {
  save(id: string, data: Record<string, string>): Promise<void>;
  load(id: string): Promise<unknown>;
}
export class MemoryShortLinkStore implements ShortLinkStore {
  private readonly values = new Map<string, { data: Record<string, string>; expires: number }>();
  constructor(
    private readonly max = 1000,
    private readonly ttl = 86400000,
  ) {}
  async save(id: string, data: Record<string, string>) {
    if (this.values.size >= this.max) this.values.delete(this.values.keys().next().value!);
    this.values.set(id, { data, expires: Date.now() + this.ttl });
  }
  async load(id: string) {
    const item = this.values.get(id);
    if (!item || item.expires < Date.now()) {
      this.values.delete(id);
      return null;
    }
    return item.data;
  }
}
export class NetlifyShortLinkStore implements ShortLinkStore {
  private store() {
    const deadline = AbortSignal.timeout(8000);
    return getStore({
      name: 'short-links',
      consistency: 'strong',
      fetch: (url, options = {}) =>
        fetch(url, {
          ...options,
          signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
        }),
    });
  }
  private async withinDeadline<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Storage timeout')), 10000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async save(id: string, data: Record<string, string>) {
    try {
      await this.withinDeadline(this.store().setJSON(id, data));
    } catch {
      throw new HttpError(
        503,
        'Le lien court n’a pas pu être créé. Le lien complet reste disponible.',
        'STORAGE_UNAVAILABLE',
      );
    }
  }
  async load(id: string) {
    try {
      return await this.withinDeadline(this.store().get(id, { type: 'json' }));
    } catch {
      throw new HttpError(
        503,
        'Ce lien ne peut pas être chargé pour le moment. Réessayez.',
        'STORAGE_UNAVAILABLE',
      );
    }
  }
}
export function shortId(): string {
  return randomBytes(9).toString('base64url');
}
