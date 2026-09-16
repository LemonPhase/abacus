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
  // the filesystem prior to rewrites being applied", then rewrites in order —
  // against the real build output, so a missing or malformed vercel.json means
  // broken deep links or broken assets here, not just in production. Needs
  // `npm run build` first; skipped when dist/ is absent (CI builds it).
  it.skipIf(!distReady)(
    'resolves deep routes to index.html while existing build files bypass the rewrite',
    () => {
      const files = collectDistFiles(DIST_DIR)
      expect(files.has('index.html')).toBe(true)
      expect([...files].some((f) => f.startsWith('assets/'))).toBe(true)

      // resolveRequest returns the path Vercel would actually serve (relative
      // to dist/). Unmatched paths come back unchanged — a 404 in production.
      const resolveRequest = (path: string): string => {
        const normalized = path.replace(/^\//, '')
        // 1. Filesystem precedence: built files win over any rewrite.
        if (files.has(normalized)) return normalized
        // 2. Rewrites applied in order; first source matching the path wins.
        for (const rewrite of config.rewrites ?? []) {
          const match = compileSource(rewrite.source).exec(path)
          if (match) {
            const destination = rewrite.destination.replace(
              /:([A-Za-z0-9_]+)/g,
              (_, name: string) => match.groups?.[name] ?? '',
            )
            // Vercel serves the destination from the deployment filesystem;
            // if it doesn't exist there it 404s (deep links fail, loudly).
            return destination.replace(/^\//, '')
          }
        }
        return path
      }

      // Deep links (including unknown paths) fall through to the app shell...
      for (const route of [
        '/auth',
        '/auth/reset-password',
        '/app/dashboard',
        '/app/recurring',
        '/deep/nested/unknown',
        '/totally-unknown',
      ]) {
        expect(files.has(route.replace(/^\//, ''))).toBe(false)
        expect(resolveRequest(route)).toBe('index.html')
      }

      // ...while representative built assets are served as themselves: hashed
      // js/css bundles, PWA manifest and service worker, and icons.
      const hashed = (ext: string): string => {
        const file = [...files].find((f) => new RegExp(`^assets/index-.+\\.${ext}$`).test(f))
        expect(file, `expected a hashed assets/index-*.${ext} in the build output`).toBeDefined()
        return file as string
      }
      const representative = [
        hashed('js'),
        hashed('css'),
        'manifest.webmanifest',
        'sw.js',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'favicon.ico',
      ]
      for (const asset of representative) {
        expect(resolveRequest(`/${asset}`)).toBe(asset)
      }

      // Every remaining built file — hashed bundles, fonts, workbox — too.
      for (const file of files) {
        expect(resolveRequest(`/${file}`)).toBe(file)
      }
    },
  )
})

// Minimal path-to-regexp compilation covering the source constructs Vercel
// rewrites support: literal segments, :param / :param* / :param? named params,
// and inline (...) regex groups (vercel.json uses the /(.*) catch-all).
function compileSource(source: string): RegExp {
  const named = source.replace(
    /:([A-Za-z0-9_]+)(\*|\+|\?)?/g,
    (_, name: string, modifier = '') =>
      `(?<${name}>[^/]+)${modifier === '?' ? '?' : modifier || '+'}`,
  )
  // Escape nothing: path-to-regexp sources are regex-flavored (vercel.json's
  // /(.*) catch-all relies on it). Only expand :param / :param* / :param?
  // named params, then anchor. Literal regex chars in a source over-match by
  // a character class — negligible for the segment-y sources Vercel uses.
  return new RegExp(`^${named}$`)
}

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
