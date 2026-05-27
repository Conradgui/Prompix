import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: /public-demo\.spec\.ts/,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4400',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npx next start -p 4400 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:4400',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
