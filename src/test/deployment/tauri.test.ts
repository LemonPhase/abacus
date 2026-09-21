import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FX_PROVIDER_ORIGIN, parseCsp } from './csp'

/**
 * Audit 14 (#18): the packaged desktop app must ship an explicit, restrictive
 * CSP instead of `csp: null`. The production CSP is injected by Tauri into
 * every HTML file it serves (tauri://localhost); devCsp covers `tauri dev`,
 * where the Vite dev server needs inline scripts/styles and an HMR socket.
 */

interface TauriConfig {
  build?: { devUrl?: string }
  app?: { security?: { csp?: string | null; devCsp?: string | null } }
}

const tauri = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
) as TauriConfig

describe('Tauri CSP', () => {
  const csp = tauri.app?.security?.csp
  const directives = parseCsp(csp ?? '')

  it('sets a non-null production CSP (not csp: null)', () => {
    expect(csp, 'src-tauri/tauri.conf.json app.security.csp must be defined').toBeTruthy()
  })

  it('is restrictive: no framing, no plugins, no unsafe scripts or base hijack', () => {
    expect(directives['default-src']).toEqual(["'self'"])
    expect(directives['script-src']).toContain("'self'")
    expect(directives['script-src']).not.toContain("'unsafe-inline'")
    expect(directives['style-src']).toEqual(["'self'"])
    expect(directives['img-src']).toEqual(["'self'", 'data:'])
    expect(directives['font-src']).toEqual(["'self'"])
    expect(directives['frame-ancestors']).toEqual(["'none'"])
    expect(directives['form-action']).toEqual(["'self'"])
    expect(directives['object-src']).toEqual(["'none'"])
    expect(directives['base-uri']).toEqual(["'self'"])
    // Tauri adds hashes/nonces for its own injected init scripts at compile
    // time, so the configured script-src only needs the app's own sources.
  })

  it('connect-src allows only Supabase (HTTP + WS), the FX provider and Tauri IPC', () => {
    expect([...(directives['connect-src'] ?? [])].sort()).toEqual(
      [
        "'self'",
        'https://*.supabase.co',
        'wss://*.supabase.co',
        FX_PROVIDER_ORIGIN,
        // Documented Tauri v2 IPC transports (WebView2 uses http://ipc.localhost).
        'ipc:',
        'http://ipc.localhost',
      ].sort(),
    )
  })

  it('keeps a separate devCsp for the Vite dev server', () => {
    // Per the Tauri schema, devCsp falls back to csp when unspecified — the
    // strict production policy would break `tauri dev` (react-refresh inline
    // preamble, JS-injected <style> tags, HMR websocket).
    const devCsp = tauri.app?.security?.devCsp
    expect(devCsp).toBeTruthy()

    const dev = parseCsp(devCsp ?? '')
    expect(dev['script-src']).toContain("'unsafe-inline'")
    expect(dev['style-src']).toContain("'unsafe-inline'")

    const devUrl = new URL(tauri.build?.devUrl ?? 'http://localhost:5173')
    expect(dev['connect-src']).toContain(`ws://${devUrl.host}`)
    expect(dev['connect-src']).toContain(FX_PROVIDER_ORIGIN)
  })
})
