import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export const MAX_PDF_PAGES = 40
export const MAX_STATEMENT_CHARS = 60_000

export class PdfPasswordError extends Error {
  constructor() {
    super('This PDF is password-protected. Remove the password and try again.')
  }
}

export class PdfNoTextError extends Error {
  constructor() {
    super('No text found in this PDF — it may be a scanned image, which is not supported.')
  }
}

export class PdfTooManyPagesError extends Error {
  constructor(pages: number) {
    super(`PDF has ${pages} pages — the limit is ${MAX_PDF_PAGES}.`)
  }
}

export interface PdfExtractResult {
  text: string
  pages: number
  truncated: boolean
}

export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data })
  let doc
  try {
    doc = await loadingTask.promise
  } catch (err) {
    if (err instanceof Error && err.name === 'PasswordException') throw new PdfPasswordError()
    throw err
  }

  try {
    if (doc.numPages > MAX_PDF_PAGES) throw new PdfTooManyPagesError(doc.numPages)

    const parts: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      parts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
    }

    const text = parts
      .join('\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim()
    if (!text) throw new PdfNoTextError()

    return {
      text: text.slice(0, MAX_STATEMENT_CHARS),
      pages: doc.numPages,
      truncated: text.length > MAX_STATEMENT_CHARS,
    }
  } finally {
    await loadingTask.destroy()
  }
}
