import type { Account, Category, ExtractedStatement, UserSettings } from '@/types'
import {
  buildExtractionMessages,
  EXTRACTION_RESPONSE_FORMAT,
  parseExtraction,
  StatementParseError,
} from '@/lib/statement'

export class LlmAuthError extends Error {
  constructor() {
    super('Invalid API key — check the AI settings.')
  }
}

export class LlmRateLimitError extends Error {
  constructor() {
    super('AI rate limit hit — wait a moment and retry.')
  }
}

export class LlmError extends Error {
  /** 400 that looks like the endpoint rejected response_format → caller may retry with json_object. */
  unsupportedResponseFormat: boolean
  constructor(message: string, unsupportedResponseFormat = false) {
    super(message)
    this.unsupportedResponseFormat = unsupportedResponseFormat
  }
}

type ChatMessages = { system: string; user: string }

const DEFAULT_TIMEOUT_MS = 90_000

function baseUrl(settings: Pick<UserSettings, 'aiBaseUrl'>): string {
  return (settings.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
}

interface ChatOptions {
  responseFormat?: unknown
  timeoutMs?: number
  maxTokens?: number
}

export async function chatCompletion(
  settings: Pick<UserSettings, 'aiApiKey' | 'aiModel' | 'aiBaseUrl'>,
  messages: ChatMessages,
  opts: ChatOptions = {},
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${baseUrl(settings)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.aiApiKey ?? ''}`,
      },
      body: JSON.stringify({
        model: settings.aiModel,
        temperature: 0,
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
      }),
      signal: controller.signal,
    })
  } catch (err) {
    if (controller.signal.aborted) throw new LlmError('AI request timed out')
    throw new LlmError(
      `Could not reach the AI endpoint: ${err instanceof Error ? err.message : 'network error'}`,
    )
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401) throw new LlmAuthError()
  if (res.status === 429) throw new LlmRateLimitError()
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const unsupported = res.status === 400 && /response_format|json_schema|json_object/i.test(body)
    throw new LlmError(
      `AI request failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
      unsupported,
    )
  }

  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[]
  } | null
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new LlmError('AI returned an unexpected response shape')
  return content
}

export async function extractStatement(
  settings: Pick<UserSettings, 'aiApiKey' | 'aiModel' | 'aiBaseUrl'>,
  text: string,
  categories: Category[],
  account: Pick<Account, 'name' | 'currency'>,
): Promise<ExtractedStatement> {
  const messages = buildExtractionMessages(text, categories, account.name, account.currency)
  const JSON_OBJECT = { type: 'json_object' } as const

  // Bounded recovery: one format downgrade (json_schema → json_object) and one
  // parse retry — models occasionally emit a malformed response even at temp 0.
  let format: unknown = EXTRACTION_RESPONSE_FORMAT
  let parseRetriesLeft = 1
  for (;;) {
    let raw: string
    try {
      raw = await chatCompletion(settings, messages, { responseFormat: format })
    } catch (err) {
      if (err instanceof LlmError && err.unsupportedResponseFormat && format !== JSON_OBJECT) {
        format = JSON_OBJECT
        continue
      }
      throw err
    }
    try {
      return parseExtraction(raw)
    } catch (err) {
      if (parseRetriesLeft > 0 && err instanceof StatementParseError) {
        parseRetriesLeft--
        continue
      }
      throw err
    }
  }
}

/** Minimal 1-token call. Returns null on success, an error message otherwise. */
export async function testAiConnection(
  settings: Pick<UserSettings, 'aiApiKey' | 'aiModel' | 'aiBaseUrl'>,
): Promise<string | null> {
  try {
    await chatCompletion(
      settings,
      { system: 'You are a connection test.', user: 'Reply with the word OK.' },
      { maxTokens: 1, timeoutMs: 15_000 },
    )
    return null
  } catch (err) {
    return err instanceof Error ? err.message : 'Connection test failed'
  }
}
