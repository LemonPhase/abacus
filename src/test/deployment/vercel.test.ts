import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FX_PROVIDER_ORIGIN, inlineScriptHashes, parseCsp } from './csp'

interface VercelRewrite {
  source: string
  destination: string
}

interface VercelHeaderRule {
  source: string
  headers: Array<{ key: string; value: string }>
}

interface VercelConfig {
  rewrites?: VercelRewrite[]
  headers?: VercelHeaderRule[]
}

const config = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as VercelConfig

const DIST_DIR = resolve(process.cwd(), 'dist')
const distReady = existsSync(join(DIST_DIR, 'index.html'))

// Audit 14 (#18): security headers. The catch-all source is the same pattern
// as the SPA rewrite, so every path that can serve the app carries the rules.
const headerRule = config.headers?.find((h) => h.source === '/(.*)')
const headerMap = new Map(
  (headerRule?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value] as const),
)
const cspDirectives = parseCsp(headerMap.get('content-security-policy') ?? '')

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

describe('Vercel security headers', () => {
  it('sends CSP, nosniff and referrer policy on a catch-all source', () => {
    // Same catch-all as the SPA rewrite: any path the app can be served on
    // (deep links, hashed assets, sw.js, manifest) gets the same headers.
    expect(headerRule).toBeDefined()
    expect(headerRule?.source).toBe('/(.*)')
    expect(headerRule?.source).toBe(config.rewrites?.[0]?.source)

    expect(headerMap.get('x-content-type-options')).toBe('nosniff')
    expect(headerMap.get('referrer-policy')).toBe('strict-origin-when-cross-origin')

    // HSTS is set by Vercel's platform on HTTPS deployments; duplicating it
    // here risks conflicting values, so the config must not add a second one.
    expect(headerMap.has('strict-transport-security')).toBe(false)
  })

  it('covers every app route, asset and PWA endpoint', () => {
    const match = compileSource('/(.*)')
    for (const route of [
      '/',
      '/auth',
      '/auth/reset-password',
      '/app/dashboard',
      '/app/accounts',
      '/app/transactions',
      '/app/recurring',
      '/app/budgets',
      '/app/reports',
      '/app/categories',
      '/app/investments',
      '/app/settings',
      '/any/deep/unknown-route',
      '/assets/index-abc123.js',
      '/assets/index-abc123.css',
      '/registerSW.js',
      '/sw.js',
      '/workbox-abc123.js',
      '/manifest.webmanifest',
      '/pwa-192x192.png',
    ]) {
      expect(match.exec(route), `headers must cover ${route}`).not.toBeNull()
    }
  })

  it('defines a restrictive CSP', () => {
    expect(cspDirectives['default-src']).toEqual(["'self'"])

    // Scripts: same-origin bundles only, plus a hash for the built inline
    // theme-init script. No 'unsafe-inline' — the hash test below pins it.
    expect(cspDirectives['script-src']).toContain("'self'")
    expect(cspDirectives['script-src']).not.toContain("'unsafe-inline'")
    expect(cspDirectives['script-src']?.some((s) => s.startsWith("'sha256-"))).toBe(true)

    // Styles/fonts/images: bundled assets only; the dot-grid noise background
    // is an inline data: SVG, so img-src needs data:.
    expect(cspDirectives['style-src']).toEqual(["'self'"])
    expect(cspDirectives['font-src']).toEqual(["'self'"])
    expect(cspDirectives['img-src']).toEqual(["'self'", 'data:'])

    // Connections: same-origin (service-worker precache fetches), the
    // Supabase REST/auth/realtime origins (HTTP + WebSocket), and the FX
    // provider extracted from src/services/exchange.ts so a provider change
    // fails here instead of silently breaking in production.
    expect([...(cspDirectives['connect-src'] ?? [])].sort()).toEqual(
      ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', FX_PROVIDER_ORIGIN].sort(),
    )

    // PWA: the service worker and webmanifest are same-origin.
    expect(cspDirectives['worker-src']).toEqual(["'self'"])
    expect(cspDirectives['manifest-src']).toEqual(["'self'"])

    // Containment: no framing, no plugins, no base hijacking.
    expect(cspDirectives['frame-ancestors']).toEqual(["'none'"])
    expect(cspDirectives['object-src']).toEqual(["'none'"])
    expect(cspDirectives['base-uri']).toEqual(["'self'"])
  })

  // The hash above must match the script Vite actually ships. When dist/ is
  // present this fails on a stale hash instead of production failing silently
  // (the theme-init script is blocked and first paint flashes). Needs
  // `npm run build` first; CI always builds before running tests.
  it.skipIf(!distReady)('hash-allowlists every inline script in the built index.html', () => {
    const html = readFileSync(join(DIST_DIR, 'index.html'), 'utf8')

    const hashes = inlineScriptHashes(html)
    expect(hashes.length, 'theme-init inline script should exist').toBeGreaterThan(0)
    for (const hash of hashes) {
      expect(cspDirectives['script-src']).toContain(`'sha256-${hash}'`)
    }

    // style-src 'self' means the built shell must carry no inline <style>
    // and no style="" attributes either.
    expect(html).not.toMatch(/<style[\s>]/)
    expect(html).not.toMatch(/\sstyle="/)
  })
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
