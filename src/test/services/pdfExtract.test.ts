import { describe, it, expect, beforeEach, vi } from 'vitest'

const getDocument = vi.fn()

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (...args: unknown[]) => getDocument(...args),
}))

import {
  extractPdfText,
  PdfPasswordError,
  PdfNoTextError,
  PdfTooManyPagesError,
  MAX_PDF_PAGES,
  MAX_STATEMENT_CHARS,
} from '@/services/pdfExtract'

function makeDoc(numPages: number, textPerPage: string[] = []) {
  return {
    numPages,
    getPage: vi.fn(async (i: number) => ({
      getTextContent: async () => ({
        items: [{ str: textPerPage[i - 1] ?? '' }],
      }),
    })),
  }
}

beforeEach(() => {
  getDocument.mockReset()
})

describe('extractPdfText', () => {
  const file = new File(['fake'], 'statement.pdf', { type: 'application/pdf' })

  it('joins page text and reports page count', async () => {
    const doc = makeDoc(2, ['Page one text', 'Page two text'])
    getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy: vi.fn() })

    const result = await extractPdfText(file)

    expect(result.text).toContain('Page one text')
    expect(result.text).toContain('Page two text')
    expect(result.pages).toBe(2)
    expect(result.truncated).toBe(false)
    expect(doc.getPage).toHaveBeenCalledTimes(2)
  })

  it('truncates text past the size cap and flags it', async () => {
    const longText = 'x'.repeat(MAX_STATEMENT_CHARS + 500)
    const doc = makeDoc(1, [longText])
    getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy: vi.fn() })

    const result = await extractPdfText(file)

    expect(result.text).toHaveLength(MAX_STATEMENT_CHARS)
    expect(result.truncated).toBe(true)
  })

  it('rejects PDFs with too many pages before extracting', async () => {
    const doc = makeDoc(MAX_PDF_PAGES + 1)
    getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy: vi.fn() })

    await expect(extractPdfText(file)).rejects.toThrow(PdfTooManyPagesError)
  })

  it('maps password-protected PDFs to a triage error', async () => {
    getDocument.mockReturnValue({
      promise: Promise.reject(
        Object.assign(new Error('no password'), { name: 'PasswordException' }),
      ),
      destroy: vi.fn(),
    })

    await expect(extractPdfText(file)).rejects.toThrow(PdfPasswordError)
  })

  it('maps text-free (scanned) PDFs to a triage error', async () => {
    const doc = makeDoc(2, ['   ', ''])
    getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy: vi.fn() })

    await expect(extractPdfText(file)).rejects.toThrow(PdfNoTextError)
  })
})
