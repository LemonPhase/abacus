import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain',
}

export interface HeadersServer {
  origin: string
  close: () => Promise<void>
}

/**
 * Serves the production build (dist/) with the vercel.json header rules
 * applied — a local stand-in for the Vercel deployment so e2e can exercise
 * the real headers (CSP, nosniff, referrer policy) against the real bundle.
 * Unknown paths fall back to index.html, mirroring the vercel.json SPA
 * rewrite; existing build files are served as themselves.
 */
export function startHeadersServer(
  headerOverrides: Record<string, string> = {},
): Promise<HeadersServer> {
  const distDir = resolve(process.cwd(), 'dist')
  const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
  }
  const headers: Record<string, string> = {
    ...Object.fromEntries(
      (vercel.headers?.find((h) => h.source === '/(.*)')?.headers ?? []).map((h) => [
        h.key.toLowerCase(),
        h.value,
      ]),
    ),
    ...headerOverrides,
  }

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    if (path.includes('..')) {
      res.writeHead(400).end()
      return
    }
    const requested = join(distDir, path === '/' ? 'index.html' : path.replace(/^\//, ''))
    // SPA rewrite fallback for extensionless deep links; real files win.
    const abs =
      existsSync(requested) && statSync(requested).isFile()
        ? requested
        : join(distDir, 'index.html')
    res.writeHead(200, {
      ...headers,
      'content-type': MIME[extname(abs)] ?? 'application/octet-stream',
    })
    res.end(readFileSync(abs))
  })

  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      done({
        origin: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((closed) => {
            ;(server as Server).close(() => closed())
          }),
      })
    })
  })
}
