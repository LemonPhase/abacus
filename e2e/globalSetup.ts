import { execSync } from 'node:child_process'

/**
 * Playwright global setup — confirms the local Supabase stack is running and
 * exposes its URL + keys as `SUPABASE_*` env vars to test workers.
 *
 * The dev server (`npm run dev`) reads `VITE_SUPABASE_*` from `.env`; this
 * setup mirrors those values into `process.env` for the test process itself,
 * which needs the service-role key (never checked into `.env`) to provision
 * and tear down per-test users via the GoTrue admin API.
 */
export default async function globalSetup() {
  let output: string
  try {
    output = execSync('npx supabase status -o env', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    throw new Error(
      'Local Supabase is not running. Start it with `npx supabase start` before running e2e tests.',
    )
  }

  const env: Record<string, string> = {}
  for (const line of output.split('\n')) {
    const match = line.match(/^([A-Z_]+)="(.*)"$/)
    if (match) env[match[1]] = match[2]
  }

  const required = ['API_URL', 'PUBLISHABLE_KEY', 'SERVICE_ROLE_KEY'] as const
  for (const key of required) {
    if (!env[key]) {
      throw new Error(`\`supabase status\` did not return ${key}. Is the stack fully up?`)
    }
  }

  process.env.SUPABASE_URL = env.API_URL
  process.env.SUPABASE_PUBLISHABLE_KEY = env.PUBLISHABLE_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SERVICE_ROLE_KEY
}
