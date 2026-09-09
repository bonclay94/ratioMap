import { z } from 'zod';
import { HttpError } from './errors';

const featureSchema = z.object({
  type: z.literal('Feature'),
  properties: z.object({ code: z.string() }).passthrough(),
  geometry: z.object({ type: z.string(), coordinates: z.array(z.unknown()) }),
});
const collectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(featureSchema),
});
export function createBoundaryLoader(fetcher: typeof fetch = fetch) {
  let cached: z.infer<typeof collectionSchema> | null = null;
  let expires = 0;
  let loading: Promise<z.infer<typeof collectionSchema>> | null = null;
  return async (code: string) => {
    if (!cached || expires <= Date.now()) {
      loading ??= (async () => {
        try {
          const response = await fetcher(
            'https://france-geojson.gregoiredavid.fr/repo/departements.geojson',
            { signal: AbortSignal.timeout(10000) },
          );
          if (!response.ok) throw new Error('Boundary provider unavailable');
          cached = collectionSchema.parse(await response.json());
          expires = Date.now() + 86400000;
          return cached;
        } catch {
          throw new HttpError(
            502,
            'Le contour de ce département n’est pas disponible.',
            'BOUNDARY_UNAVAILABLE',
          );
        } finally {
          loading = null;
        }
      })();
      await loading;
    }
    const feature = cached?.features.find((f) => f.properties.code === code);
    if (!feature)
      throw new HttpError(
        404,
        'Le contour de ce département n’est pas disponible.',
        'BOUNDARY_NOT_FOUND',
      );
    return feature;
  };
}
