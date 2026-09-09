import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node dist/server.cjs',
    url: 'http://127.0.0.1:4174/api/health',
    reuseExistingServer: false,
    env: {
      PORT: '4174',
      GOOGLE_MAPS_API_KEY: '',
      GOOGLE_MAPS_BROWSER_KEY: '',
      ADSENSE_CLIENT_ID: '',
      ADSENSE_SLOT_ID: '',
      NETLIFY: '',
    },
  },
});
