import 'dotenv/config';
import { createServer } from 'vite';
import { createApp } from './app';

async function start() {
  const app = createApp();
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '127.0.0.1', () => console.log(`RatioMap v2 : http://127.0.0.1:${port}`));
}
start().catch(() => {
  console.error('Impossible de démarrer RatioMap. Vérifiez le port et la configuration.');
  process.exitCode = 1;
});
