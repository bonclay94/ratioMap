import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import serverless from 'serverless-http';
import { createApp } from '../src/server/app';
import { HttpError } from '../src/server/errors';
import { MemoryShortLinkStore } from '../src/server/short-links';
import { createNetlifyHandler } from '../src/server/netlify';
import { fakeProvider, query } from './fixtures';

describe('HTTP contract', () => {
  it('exposes only the browser key and public configuration', async () => {
    const app = createApp({
      env: {
        GOOGLE_MAPS_API_KEY: 'private-key',
        GOOGLE_MAPS_BROWSER_KEY: 'browser-key',
        ANOTHER_SECRET: 'secret',
      },
    });
    const result = await request(app).get('/api/config').expect(200);
    expect(result.body.mapsApiKey).toBe('browser-key');
    expect(result.body.searchAvailable).toBe(true);
    expect(result.text).not.toContain('private-key');
    expect(result.text).not.toContain('ANOTHER_SECRET');
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('starts without keys and reports unavailable search explicitly', async () => {
    const app = createApp({ env: {} });
    expect((await request(app).get('/api/config')).body.searchAvailable).toBe(false);
    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/search').query(query).expect(503);
  });
  it('rejects invalid inputs before calling the provider', async () => {
    const provider = fakeProvider();
    const app = createApp({ provider });
    await request(app)
      .get('/api/search')
      .query({ ...query, lat: '91' })
      .expect(400);
    await request(app)
      .get('/api/search')
      .query({ ...query, q: ['café', 'dentiste'] })
      .expect(400);
    await request(app).get('/api/place-details').query({ placeId: 'bad/id' }).expect(400);
    expect(provider.search).not.toHaveBeenCalled();
  });
  it('handles all API routes, including zero reverse coordinates and direct function paths', async () => {
    const app = createApp({
      provider: fakeProvider(),
      boundaryLoader: vi.fn(async () => ({
        type: 'Feature' as const,
        properties: { code: '75' },
        geometry: { type: 'Polygon', coordinates: [] },
      })),
    });
    expect((await request(app).get('/api/search').query(query).expect(200)).body.count).toBe(1);
    await request(app).get('/api/geocode').query({ address: 'Paris' }).expect(200);
    await request(app).get('/api/reverse-geocode').query({ lat: '0', lng: '0' }).expect(200);
    await request(app).get('/api/place-details').query({ placeId: 'place-one' }).expect(200);
    await request(app).get('/api/department-boundary').query({ code: '75' }).expect(200);
    await request(app).get('/.netlify/functions/api/search').query(query).expect(200);
    await request(app).get('/api/nope').expect(404);
  });
  it('never exposes raw upstream errors or credentials', async () => {
    const provider = fakeProvider();
    vi.mocked(provider.search).mockRejectedValue(new Error('key=private-secret'));
    const result = await request(createApp({ provider }))
      .get('/api/search')
      .query(query)
      .expect(500);
    expect(result.text).not.toContain('private-secret');
    expect(result.body.code).toBe('INTERNAL_ERROR');
  });
  it('validates, stores and restores a share without arbitrary fields', async () => {
    const store = new MemoryShortLinkStore();
    const app = createApp({ provider: fakeProvider(), store });
    const result = await request(app)
      .post('/api/shorten')
      .send({ ...query, ratingMin: '4.5', address: 'Paris', junk: 'do-not-store' })
      .expect(201);
    const data = await store.load(result.body.id);
    expect(data).not.toHaveProperty('junk');
    const redirect = await request(app).get(`/s/${result.body.id}`).expect(302);
    expect(redirect.headers.location).toContain('ratingMin=4.5');
    expect(result.body.temporary).toBe(true);
    await request(app).post('/api/shorten').send({ invalid: 'data' }).expect(400);
    await request(app)
      .post('/api/shorten')
      .set('Content-Type', 'application/json')
      .send('{no')
      .expect(400);
    await request(app)
      .post('/api/shorten')
      .send({ q: 'x'.repeat(9000) })
      .expect(413);
  });
  it('keeps legacy seven-character links and reports missing ones', async () => {
    const store = new MemoryShortLinkStore();
    await store.save('old1234', query);
    const app = createApp({ provider: fakeProvider(), store });
    expect((await request(app).get('/s/old1234').expect(302)).headers.location).toContain('q=caf');
    expect((await request(app).get('/s/missing').expect(302)).headers.location).toBe(
      '/?share=missing',
    );
  });
  it('does not pretend to save a link when durable storage fails', async () => {
    const app = createApp({
      provider: fakeProvider(),
      store: {
        save: async () => {
          throw new HttpError(503, 'Storage unavailable');
        },
        load: async () => null,
      },
    });
    await request(app).post('/api/shorten').send(query).expect(503);
  });
  it('never caches a boundary error as a successful geographic resource', async () => {
    const app = createApp({
      boundaryLoader: async () => {
        throw new HttpError(502, 'Unavailable');
      },
    });
    const result = await request(app)
      .get('/api/department-boundary')
      .query({ code: '75' })
      .expect(502);
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('runs behind the real serverless-http adapter with original and rewritten Netlify paths', async () => {
    const handler = serverless(createApp({ provider: fakeProvider() }));
    for (const path of ['/api/search', '/.netlify/functions/api/search']) {
      const result = (await handler(
        {
          httpMethod: 'GET',
          path,
          headers: {},
          queryStringParameters: query,
          body: null,
          isBase64Encoded: false,
          requestContext: {},
        },
        {} as never,
      )) as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).count).toBe(1);
    }
  });
  it('runs on the modern Netlify Request/Response adapter, including short-link redirects', async () => {
    const handler = createNetlifyHandler({
      provider: fakeProvider(),
      store: new MemoryShortLinkStore(),
      env: {},
    });
    const context = { requestId: 'unit-test' } as Parameters<typeof handler>[1];
    const response = await handler(
      new Request(`https://example.test/api/search?${new URLSearchParams(query)}`),
      context,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).count).toBe(1);
    const shortened = await handler(
      new Request('https://example.test/api/shorten', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(query),
      }),
      context,
    );
    const { id } = await shortened.json();
    const redirect = await handler(
      new Request(`https://example.test/.netlify/functions/api/s/${id}`),
      context,
    );
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toContain('q=caf');
  });
  it('propagates Netlify request cancellation to the Google provider', async () => {
    const provider = fakeProvider();
    const controller = new AbortController();
    vi.mocked(provider.search).mockImplementation(async (_center, _radius, _q, signal) => {
      controller.abort();
      signal?.throwIfAborted();
      return { places: [], attributions: [] };
    });
    const handler = createNetlifyHandler({ provider, store: new MemoryShortLinkStore(), env: {} });
    const response = await handler(
      new Request(`https://example.test/api/search?${new URLSearchParams(query)}`, {
        signal: controller.signal,
      }),
      { requestId: 'unit-test' } as Parameters<typeof handler>[1],
    );
    expect(response.status).toBe(504);
    expect(vi.mocked(provider.search).mock.calls[0][3]?.aborted).toBe(true);
  });
});
