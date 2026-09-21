import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * FX provider origin, extracted from the service that fetches it so the CSP
 * connect-src lists can't silently drift from the code (issue #18: the
 * provider is a runtime fetch and may change without touching the configs).
 */
export const FX_PROVIDER_ORIGIN = (() => {
  const source = readFileSync(resolve(process.cwd(), 'src/services/exchange.ts'), 'utf8')
  const match = source.match(/const API_BASE = '(https?:\/\/[^'/]+)\//)
  if (!match) throw new Error('Could not extract API_BASE from src/services/exchange.ts')
  return match[1]
})()

/**
 * Parse a CSP header value into directive → source-list. Directive names are
 * lowercased; unknown directives are kept so new ones fail assertions loudly.
 */
export function parseCsp(csp: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {}
  for (const part of csp.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const [name, ...sources] = trimmed.split(/\s+/)
    directives[name.toLowerCase()] = sources
  }
  return directives
}

/**
 * sha256-base64 digests of every inline (src-less) `<script>` body in an HTML
 * document, in document order — the exact values a CSP hash source must list.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = []
  const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g
  let match: RegExpExecArray | null
  while ((match = inlineScript.exec(html))) {
    hashes.push(createHash('sha256').update(match[1], 'utf8').digest('base64'))
  }
  return hashes
}
