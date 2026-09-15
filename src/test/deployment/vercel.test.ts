import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface VercelRewrite {
  source: string
  destination: string
}

interface VercelConfig {
  rewrites?: VercelRewrite[]
}

const config = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as VercelConfig

const DIST_DIR = resolve(process.cwd(), 'dist')
const distReady = existsSync(join(DIST_DIR, 'index.html'))

describe('Vercel SPA routing', () => {
  it('rewrites client-side routes to the Vite app shell', () => {
    expect(config.rewrites).toEqual([
      {
        source: '/(.*)',
        destination: '/index.html',
      },
    ])
  })

  it('uses a filesystem-preserving rewrite rather than overriding static files', () => {
    const [rewrite] = config.rewrites ?? []

    // Vercel checks the deployment filesystem before applying rewrites. Keep
    // this rule broad for extensionless BrowserRouter URLs, but do not turn it
    // into a file-specific route that could take precedence over assets.
    expect(rewrite?.source).not.toMatch(/\.[a-z]+(?:\)|$)/i)
    expect(rewrite?.destination).toBe('/index.html')
  })

  // Simulates Vercel's documented resolution order — "precedence is given to
  // the filesystem prior to rewrites being applied" — against the real build
  // output, so a broken rewrite means broken deep links or broken assets in
  // production. Needs `npm run build` first; skipped when dist/ is absent.
  it.skipIf(!distReady)(
    'resolves deep routes to index.html while existing build files bypass the rewrite',
    () => {
      const files = collectDistFiles(DIST_DIR)
      expect(files.has('index.html')).toBe(true)
      expect([...files].some((f) => f.startsWith('assets/'))).toBe(true)

      const serve = (path: string): string => {
        const normalized = path.replace(/^\//, '')
        if (files.has(normalized)) return normalized // filesystem wins
        return (config.rewrites?.[0]?.destination ?? path).replace(/^\//, '')
      }

      // Deep links (including unknown paths) fall through to the app shell...
      for (const route of [
        '/auth',
        '/auth/reset-password',
        '/app/dashboard',
        '/app/recurring',
        '/totally-unknown',
      ]) {
        expect(files.has(route.replace(/^\//, ''))).toBe(false)
        expect(serve(route)).toBe('index.html')
      }

      // ...while every built file — hashed bundles and PWA assets — is served as itself.
      for (const file of files) {
        expect(serve(`/${file}`)).toBe(file)
      }
    },
  )
})

function collectDistFiles(dir: string, prefix = ''): Set<string> {
  const files = new Set<string>()
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      for (const nested of collectDistFiles(join(dir, entry.name), key)) files.add(nested)
    } else {
      files.add(key)
    }
  }
  return files
}
