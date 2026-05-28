import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for TrueSight.me consistency tests
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI 
    ? [['html'], ['github']] // GitHub Actions format + HTML report
    : 'html', // Local: just HTML report
  
  use: {
    // PLAYWRIGHT_BASE_URL env lets CI point tests at the deployed beta
    // (post-deploy run); default stays prod so local/manual runs are unchanged.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://www.truesight.me',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // When PLAYWRIGHT_BASE_URL is set (post-deploy CI against live beta), no local
  // server is needed — omit webServer entirely. Otherwise the placeholder "echo"
  // exited immediately and Playwright waited forever for port 3000.
  ...(process.env.PLAYWRIGHT_BASE_URL ? {} : {
    webServer: {
      command: 'echo "Tests run against production. No local server needed."',
      port: 3000,
      reuseExistingServer: true,
    },
  }),
});
