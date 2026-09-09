import path from 'node:path';
import express, { type RequestHandler, type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import {
  buildSearchParams,
  coordinatesSchema,
  parseSearchParams,
  searchSchema,
} from '../shared/search';
import type { PublicConfig } from '../shared/types';
import { GooglePlacesProvider, type PlacesProvider } from './google';
import { searchPlaces } from './search-service';
import { HttpError } from './errors';
import {
  MemoryShortLinkStore,
  NetlifyShortLinkStore,
  shortId,
  type ShortLinkStore,
} from './short-links';
import { createBoundaryLoader } from './boundaries';

export const REQUEST_SIGNAL = Symbol('ratiomap.requestSignal');

export interface AppOptions {
  provider?: PlacesProvider;
  store?: ShortLinkStore;
  env?: NodeJS.ProcessEnv;
  staticDirectory?: string;
  boundaryLoader?: ReturnType<typeof createBoundaryLoader>;
}
const asyncRoute =
  (handler: (req: express.Request, res: express.Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };

export function createApp(options: AppOptions = {}) {
  const env = options.env ?? process.env;
  const provider = options.provider ?? new GooglePlacesProvider(env.GOOGLE_MAPS_API_KEY);
  const store =
    options.store ??
    (env.NETLIFY === 'true' ? new NetlifyShortLinkStore() : new MemoryShortLinkStore());
  const boundary = options.boundaryLoader ?? createBoundaryLoader();
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
    });
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  const api = express.Router();
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const config: PublicConfig = {
    mapsApiKey: env.GOOGLE_MAPS_BROWSER_KEY || null,
    mapsMapId: env.GOOGLE_MAPS_MAP_ID || null,
    searchAvailable: Boolean(env.GOOGLE_MAPS_API_KEY || options.provider),
    adsenseClientId: /^ca-pub-\d+$/.test(env.ADSENSE_CLIENT_ID || '')
      ? env.ADSENSE_CLIENT_ID!
      : null,
    adsenseSlotId: /^\d+$/.test(env.ADSENSE_SLOT_ID || '') ? env.ADSENSE_SLOT_ID! : null,
  };
  api.get('/config', (_req, res) => {
    res.json(config);
  });
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '2.0.0' });
  });
  let active = 0;
  api.use((req, res, next) => {
    if (active >= 12) {
      res.set('Retry-After', '5');
      res.status(429).json({
        error: 'Trop de recherches simultanées. Réessayez dans quelques secondes.',
        code: 'BUSY',
      });
      return;
    }
    active++;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new DOMException('Request timeout', 'TimeoutError')),
      25000,
    );
    res.once('close', () => {
      clearTimeout(timeout);
      controller.abort();
      active--;
    });
    req.once('aborted', () => controller.abort());
    const incomingSignal = (req as express.Request & { [REQUEST_SIGNAL]?: AbortSignal })[
      REQUEST_SIGNAL
    ];
    res.locals.signal = incomingSignal
      ? AbortSignal.any([controller.signal, incomingSignal])
      : controller.signal;
    next();
  });
  api.get(
    '/search',
    asyncRoute(async (req, res) => {
      res.json(await searchPlaces(provider, searchSchema.parse(req.query), res.locals.signal));
    }),
  );
  api.get(
    '/geocode',
    asyncRoute(async (req, res) => {
      const address = z.string().trim().min(1).max(300).parse(req.query.address);
      res.json(await provider.geocode(address, res.locals.signal));
    }),
  );
  api.get(
    '/reverse-geocode',
    asyncRoute(async (req, res) => {
      const coords = coordinatesSchema.parse(req.query);
      res.json(await provider.reverseGeocode(coords.lat, coords.lng, res.locals.signal));
    }),
  );
  api.get(
    '/place-details',
    asyncRoute(async (req, res) => {
      const id = z
        .string()
        .regex(/^[\w-]{1,256}$/)
        .parse(req.query.placeId);
      res.json(await provider.details(id, res.locals.signal));
    }),
  );
  api.get(
    '/department-boundary',
    asyncRoute(async (req, res) => {
      const code = z
        .string()
        .regex(/^(?:\d{2,3}|2A|2B)$/)
        .parse(req.query.code);
      const feature = await boundary(code);
      res.set('Cache-Control', 'public, max-age=86400').json(feature);
    }),
  );
  api.post(
    '/shorten',
    asyncRoute(async (req, res) => {
      const raw = z.record(z.string(), z.string().max(500)).parse(req.body);
      const state = parseSearchParams(new URLSearchParams(raw));
      if (!state)
        throw new HttpError(400, 'Les paramètres de partage ne sont pas valides.', 'INVALID_SHARE');
      const id = shortId();
      await store.save(id, Object.fromEntries(buildSearchParams(state)));
      res.status(201).json({ id, temporary: !(store instanceof NetlifyShortLinkStore) });
    }),
  );
  const resolveLink = asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!/^[\w-]{7,24}$/.test(String(req.params.id))) {
      res.redirect('/?share=missing');
      return;
    }
    const parsed = z
      .record(z.string(), z.string())
      .safeParse(await store.load(String(req.params.id)));
    const state = parsed.success ? parseSearchParams(new URLSearchParams(parsed.data)) : null;
    res.redirect(state ? `/?${buildSearchParams(state)}` : '/?share=missing');
  });
  app.get('/s/:id', resolveLink);
  api.get('/s/:id', resolveLink);
  app.use(['/api', '/.netlify/functions/api'], api);
  app.use(['/api', '/.netlify/functions/api'], (_req, res) => {
    res.status(404).json({ error: 'Route inconnue.', code: 'NOT_FOUND' });
  });
  if (options.staticDirectory)
    app.use(
      express.static(options.staticDirectory, {
        setHeaders: (res, file) => {
          res.setHeader(
            'Cache-Control',
            file.includes(`${path.sep}assets${path.sep}`)
              ? 'public, max-age=31536000, immutable'
              : 'no-cache',
          );
        },
      }),
    );
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (res.headersSent || res.destroyed) return;
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Vérifiez les paramètres de recherche.',
        code: 'INVALID_INPUT',
        fields: [...new Set(error.issues.map((i) => i.path[0]).filter(Boolean))],
      });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
      res.status(504).json({
        error: 'La recherche a pris trop de temps. Essayez une zone plus précise.',
        code: 'TIMEOUT',
      });
      return;
    }
    const status = typeof error === 'object' && error && 'status' in error ? error.status : null;
    if (status === 400 || status === 413) {
      res
        .status(status)
        .json({ error: 'La requête est invalide ou trop volumineuse.', code: 'INVALID_BODY' });
      return;
    }
    res.status(500).json({
      error: 'Une erreur est survenue. Réessayez dans quelques instants.',
      code: 'INTERNAL_ERROR',
    });
  };
  app.use(errors);
  return app;
}
