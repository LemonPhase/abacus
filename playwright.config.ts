import { defineConfig, devices } from '@playwright/test'

// E2E_PORT lets parallel worktrees run e2e against their own dev server
// instead of colliding on whatever occupies 5173.
const port = process.env.E2E_PORT ?? '5173'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/globalSetup.ts',
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
  use: {
    baseURL: `http://localhost:${port}`,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
