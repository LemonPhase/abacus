import Papa from 'papaparse'

export interface ParsedRow {
  [key: string]: string
}

export interface CsvParseResult {
  headers: string[]
  rows: ParsedRow[]
  errors: Papa.ParseError[]
}

export function parseCSV(file: File): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          headers: results.meta.fields ?? [],
          rows: results.data as ParsedRow[],
          errors: results.errors,
        })
      },
      error: (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`))
      },
    })
  })
}

export interface ColumnMapping {
  date: string
  description: string
  amount: string
  type: string
}

export const DEFAULT_COLUMN_NAMES: ColumnMapping = {
  date: '',
  description: '',
  amount: '',
  type: '',
}

export function detectColumns(headers: string[]): ColumnMapping {
  const mapping = { ...DEFAULT_COLUMN_NAMES }

  for (const h of headers) {
    const lower = h.toLowerCase()
    if (
      !mapping.date &&
      (lower.includes('date') || lower === 'posted' || lower === 'transaction date')
    ) {
      mapping.date = h
    }
    if (
      !mapping.description &&
      (lower.includes('desc') ||
        lower.includes('memo') ||
        lower.includes('payee') ||
        lower.includes('name') ||
        lower.includes('narrative'))
    ) {
      mapping.description = h
    }
    if (
      !mapping.amount &&
      (lower.includes('amount') ||
        lower.includes('sum') ||
        lower.includes('value') ||
        lower === 'debit' ||
        lower === 'credit')
    ) {
      mapping.amount = h
    }
    if (
      !mapping.type &&
      (lower.includes('type') || lower === 'transaction type' || lower === 'direction')
    ) {
      mapping.type = h
    }
  }

  return mapping
}

export interface ImportRow {
  date: string
  description: string
  amount: string
  type?: 'income' | 'expense'
}

export function applyMapping(rows: ParsedRow[], mapping: ColumnMapping): ImportRow[] {
  return rows.map((row) => ({
    date: mapping.date ? (row[mapping.date] ?? '') : '',
    description: mapping.description ? (row[mapping.description] ?? '') : '',
    amount: mapping.amount ? (row[mapping.amount] ?? '') : '',
    type: mapping.type ? detectTransactionType(row[mapping.type] ?? '') : undefined,
  }))
}

function detectTransactionType(value: string): 'income' | 'expense' | undefined {
  const lower = value.toLowerCase()
  if (
    lower.includes('income') ||
    lower.includes('credit') ||
    lower.includes('deposit') ||
    lower === 'in'
  )
    return 'income'
  if (
    lower.includes('expense') ||
    lower.includes('debit') ||
    lower.includes('payment') ||
    lower.includes('withdrawal') ||
    lower === 'out'
  )
    return 'expense'
  return undefined
}

export function parseAmount(raw: string): number {
  if (!raw) return 0
  // Remove currency symbols, commas, and spaces
  let cleaned = raw.replace(/[$€£¥₹,\s]/g, '')
  // Handle parentheses for negative numbers: (100) → -100
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1)
  }
  // Handle leading minus
  return parseFloat(cleaned) || 0
}

export function parseDate(raw: string): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  if (isNaN(d.getTime())) return null
  return d
}
