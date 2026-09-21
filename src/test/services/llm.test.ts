import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  chatCompletion,
  extractStatement,
  LlmAuthError,
  LlmError,
  LlmRateLimitError,
  testAiConnection,
} from '@/services/llm'

const settings = { aiApiKey: 'sk-test', aiModel: 'test-model', aiBaseUrl: '' }

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }
}

const validStatement = {
  bankName: 'Test Bank',
  accountHint: '••1234',
  periodStart: '2025-01-01',
  periodEnd: '2025-01-31',
  currency: 'USD',
  openingBalance: 100,
  closingBalance: 70,
  transactions: [],
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('chatCompletion', () => {
  it('posts to the chat completions endpoint with bearer auth and model', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'OK' } }] }))

    const result = await chatCompletion(settings, { system: 's', user: 'u' })

    expect(result).toBe('OK')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('test-model')
    expect(body.messages).toEqual([
      { role: 'system', content: 's' },
      { role: 'user', content: 'u' },
    ])
  })

  it('uses the configured base url when set', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'OK' } }] }))

    await chatCompletion(
      { ...settings, aiBaseUrl: 'https://llm.example.com/v1/' },
      { system: 's', user: 'u' },
    )

    expect(fetchMock.mock.calls[0][0]).toBe('https://llm.example.com/v1/chat/completions')
  })

  it('maps 401 to an auth error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: {} }, 401))
    await expect(chatCompletion(settings, { system: 's', user: 'u' })).rejects.toThrow(LlmAuthError)
  })

  it('maps 429 to a rate limit error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: {} }, 429))
    await expect(chatCompletion(settings, { system: 's', user: 'u' })).rejects.toThrow(
      LlmRateLimitError,
    )
  })

  it('maps network failures to a generic error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(chatCompletion(settings, { system: 's', user: 'u' })).rejects.toThrow(LlmError)
  })

  it('rejects unexpected response shapes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ nope: true }))
    await expect(chatCompletion(settings, { system: 's', user: 'u' })).rejects.toThrow(LlmError)
  })
})

describe('extractStatement', () => {
  const categories = [
    {
      id: 'cat-g',
      name: 'Groceries',
      type: 'expense',
      color: '#111',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ] as never[]
  const account = { name: 'Checking', currency: 'USD' }

  it('sends the json_schema response format and parses the result', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: JSON.stringify(validStatement) } }] }),
    )

    const statement = await extractStatement(settings, 'STATEMENT TEXT', categories, account)

    expect(statement.bankName).toBe('Test Bank')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.response_format.type).toBe('json_schema')
    expect(body.messages[1].content).toContain('STATEMENT TEXT')
    expect(body.messages[1].content).toContain('cat-g')
  })

  it('falls back to json_object when the endpoint rejects json_schema', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'response_format json_schema is not supported' } }, 400),
      )
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: JSON.stringify(validStatement) } }] }),
      )

    const statement = await extractStatement(settings, 'TEXT', categories, account)

    expect(statement.bankName).toBe('Test Bank')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(secondBody.response_format).toEqual({ type: 'json_object' })
  })

  it('does not retry non-response-format errors', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'server error' } }, 500))

    await expect(extractStatement(settings, 'TEXT', categories, account)).rejects.toThrow(LlmError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws a parse error when the model returns malformed JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'garbage' } }] }))

    await expect(extractStatement(settings, 'TEXT', categories, account)).rejects.toThrow(
      /invalid-json/,
    )
  })

  it('retries once when the first response fails to parse', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'garbage' } }] }))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: JSON.stringify(validStatement) } }] }),
      )

    const statement = await extractStatement(settings, 'TEXT', categories, account)
    expect(statement.bankName).toBe('Test Bank')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('testAiConnection', () => {
  it('returns null on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'OK' } }] }))
    expect(await testAiConnection(settings)).toBeNull()
  })

  it('returns the error message on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: {} }, 401))
    expect(await testAiConnection(settings)).toMatch(/API key/i)
  })
})
