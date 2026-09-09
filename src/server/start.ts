import 'dotenv/config';
import path from 'node:path';
import { createApp } from './app';

const port = Number(process.env.PORT || 3000);
createApp({ staticDirectory: path.resolve('dist/client') }).listen(port, () =>
  console.log(`RatioMap v2 : http://localhost:${port}`),
);
