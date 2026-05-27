import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /public-demo\.spec\.ts/,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4401',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'NEXT_PUBLIC_RUNTIME_POLICY=public-demo npm run build && NEXT_PUBLIC_RUNTIME_POLICY=public-demo npx next start -p 4401 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:4401',
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
