import { describe, expect, it, vi } from 'vitest';
import { GooglePlacesProvider } from '../src/server/google';
import { Semaphore } from '../src/server/concurrency';
import { MemoryShortLinkStore } from '../src/server/short-links';
import { rawPlace } from './fixtures';

describe('Google adapter', () => {
  it('paginates at most three pages, retries an inactive token, and skips the final unnecessary wait', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher
      .mockResolvedValueOnce(
        Response.json({ status: 'OK', results: [rawPlace], next_page_token: 'two' }),
      )
      .mockResolvedValueOnce(Response.json({ status: 'INVALID_REQUEST' }))
      .mockResolvedValueOnce(
        Response.json({
          status: 'OK',
          results: [{ ...rawPlace, place_id: 'two' }],
          next_page_token: 'three',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status: 'OK',
          results: [{ ...rawPlace, place_id: 'three' }],
          next_page_token: 'four',
        }),
      );
    const provider = new GooglePlacesProvider('test-key', fetcher, 0);
    const result = await provider.search({ lat: 0, lng: 0 }, 1000, 'café');
    expect(result.places).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get('pagetoken')).toBe('two');
  });
  it('redacts provider error messages and returns actionable errors', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ status: 'REQUEST_DENIED', error_message: 'key=test-secret' }),
      );
    await expect(
      new GooglePlacesProvider('test-secret', fetcher).search({ lat: 0, lng: 0 }, 1000, 'test'),
    ).rejects.toMatchObject({ status: 503, code: 'UPSTREAM_DENIED' });
  });
  it('skips malformed places while accepting empty search results', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ status: 'OK', results: [{ name: 'missing ID' }, rawPlace] }),
      )
      .mockResolvedValueOnce(Response.json({ status: 'ZERO_RESULTS', results: [] }));
    const provider = new GooglePlacesProvider('key', fetcher);
    expect((await provider.search({ lat: 0, lng: 0 }, 1000, 'test')).places).toHaveLength(1);
    expect((await provider.search({ lat: 0, lng: 0 }, 1000, 'test')).places).toHaveLength(0);
  });
  it('retains author attributions and disallows executable website URLs', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: 'OK',
        result: {
          name: 'Café',
          website: 'javascript:alert(1)',
          reviews: [
            {
              author_name: 'A',
              author_url: 'https://example.com/a',
              text: '<script>bad</script>',
              rating: 5,
            },
          ],
        },
        html_attributions: ['<a href="https://example.com">Source</a>'],
      }),
    );
    const result = await new GooglePlacesProvider('key', fetcher).details('place-one');
    expect(result.website).toBeNull();
    expect(result.reviews[0].authorUrl).toBe('https://example.com/a');
    expect(result.reviews[0].text).toContain('<script>'); // React displays this as text.
    expect(result.attributions).toEqual(['Source']);
  });
  it('aborts queued and in-flight work', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async (_url, opts) =>
        new Promise((_resolve, reject) =>
          opts?.signal?.addEventListener('abort', () => reject(opts.signal?.reason), {
            once: true,
          }),
        ),
    );
    const provider = new GooglePlacesProvider('key', fetcher);
    const controller = new AbortController();
    const task = provider.search({ lat: 0, lng: 0 }, 1000, 'test', controller.signal);
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
  });
});
describe('bounded resources', () => {
  it('removes an aborted queued job without leaking a concurrency permit', async () => {
    const slots = new Semaphore(1);
    let release!: () => void;
    const first = slots.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const controller = new AbortController();
    const work = vi.fn(async () => 2);
    const second = slots.run(work, controller.signal);
    controller.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    release();
    await first;
    expect(await slots.run(async () => 3)).toBe(3);
    expect(work).not.toHaveBeenCalled();
  });
  it('bounds local short links and expires them', async () => {
    const store = new MemoryShortLinkStore(1, 10);
    await store.save('one', { q: 'one' });
    await store.save('two', { q: 'two' });
    expect(await store.load('one')).toBeNull();
    expect(await store.load('two')).toEqual({ q: 'two' });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11);
    expect(await store.load('two')).toBeNull();
  });
});
