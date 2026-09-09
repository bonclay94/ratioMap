import { withLambda, type HandlerResponse } from '@netlify/aws-lambda-compat';
import serverless from 'serverless-http';
import type { IncomingMessage } from 'node:http';
import { createApp, REQUEST_SIGNAL, type AppOptions } from './app';

/** Keep Express routes on the modern Netlify runtime, including its Blobs context. */
export function createNetlifyHandler(options: AppOptions = {}) {
  const app = createApp({ ...options, env: { ...(options.env ?? process.env), NETLIFY: 'true' } });
  const adapter = serverless(app, {
    request: (
      req: IncomingMessage & { [REQUEST_SIGNAL]?: AbortSignal },
      event: { requestSignal?: AbortSignal },
    ) => {
      req[REQUEST_SIGNAL] = event.requestSignal;
    },
  });
  return (request: Request, context: Parameters<ReturnType<typeof withLambda>>[1]) =>
    withLambda(
      (event, lambdaContext) =>
        adapter(
          { ...event, requestSignal: request.signal },
          lambdaContext,
        ) as Promise<HandlerResponse>,
    )(request, context);
}
