import type {
  Category,
  ExtractedKind,
  ExtractedStatement,
  ExtractedTransaction,
  ImportTransaction,
  ImportReviewRow,
  TransactionKind,
} from '@/types'

// --- Prompt + schema ---

export interface ExtractionMessages {
  system: string
  user: string
}

const EXTRACTED_KINDS: ExtractedKind[] = [
  'purchase',
  'income',
  'transfer',
  'fee',
  'refund',
  'interest',
]

export function buildExtractionMessages(
  text: string,
  categories: Category[],
  accountName: string,
  accountCurrency: string,
): ExtractionMessages {
  const categoryList = categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))

  const system = [
    'You are a bank statement extraction engine. You output only JSON.',
    'Extract every transaction line from the statement: spending, income, transfers, fees, refunds, and interest. Nothing is skipped.',
    'Rules:',
    '- Emit exactly the JSON schema given; no extra fields.',
    '- date: ISO yyyy-mm-dd from the transaction date row.',
    '- amount: absolute value, always positive.',
    '- direction: "debit" = money leaving the account, "credit" = money entering it.',
    '- kind: "purchase" (card spend / POS), "income" (salary, payments received), "transfer" (moves to/from the same holder\'s own accounts), "fee" (bank/service fees), "refund" (reversals of prior charges), "interest" (interest earned).',
    '- merchant: a clean name — strip card numbers, dates, reference/authorization codes, and store ids. Keep the recognizable brand name.',
    '- description: the original statement line text.',
    '- pending: true only for pending or authorization-hold rows.',
    '- confidence: how sure you are the row was read and classified correctly.',
    '- categoryId: MUST be the id of one of the provided categories, matching the row direction (income-type categories only for credit rows, expense-type only for debit rows). Use null if none fits.',
    '- Do not merge or split rows; one JSON entry per statement line.',
  ].join('\n')

  const user = [
    `Account: ${accountName} (currency: ${accountCurrency}).`,
    `Categories (id | name | type):`,
    JSON.stringify(categoryList),
    'Statement text follows. Extract it into the JSON schema.',
    '---',
    text,
  ].join('\n')

  return { system, user }
}

// OpenAI strict-mode json_schema: every property required, additionalProperties false.
const extractedTxSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    date: { type: 'string', description: 'ISO yyyy-mm-dd' },
    description: { type: 'string' },
    merchant: { type: 'string' },
    amount: { type: 'number', description: 'absolute value, positive' },
    direction: { type: 'string', enum: ['debit', 'credit'] },
    kind: { type: 'string', enum: EXTRACTED_KINDS },
    pending: { type: 'boolean' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    categoryId: { type: ['string', 'null'] },
  },
  required: [
    'date',
    'description',
    'merchant',
    'amount',
    'direction',
    'kind',
    'pending',
    'confidence',
    'categoryId',
  ],
}

export const EXTRACTION_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'statement',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        bankName: { type: 'string' },
        accountHint: {
          type: 'string',
          description: 'masked account number or label from the statement',
        },
        periodStart: { type: 'string', description: 'ISO yyyy-mm-dd' },
        periodEnd: { type: 'string', description: 'ISO yyyy-mm-dd' },
        currency: { type: 'string', description: 'ISO 4217 code' },
        openingBalance: { type: 'number' },
        closingBalance: { type: 'number' },
        transactions: { type: 'array', items: extractedTxSchema },
      },
      required: [
        'bankName',
        'accountHint',
        'periodStart',
        'periodEnd',
        'currency',
        'openingBalance',
        'closingBalance',
        'transactions',
      ],
    },
  },
} as const

// --- Parsing / validation ---

export type StatementParseErrorReason = 'invalid-json' | 'missing-field' | 'bad-type'

export class StatementParseError extends Error {
  reason: StatementParseErrorReason
  constructor(reason: StatementParseErrorReason, detail: string) {
    super(`Failed to parse AI response (${reason}): ${detail}`)
    this.reason = reason
  }
}

function req(obj: Record<string, unknown>, key: string, where: string): unknown {
  if (!(key in obj) || obj[key] === undefined) {
    throw new StatementParseError('missing-field', `${where}.${key}`)
  }
  return obj[key]
}

/** Strict shape + real calendar validity (no 2025-02-31 rolling into March). */
export function isValidCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const year = Number(s.slice(0, 4))
  const month = Number(s.slice(5, 7))
  const day = Number(s.slice(8, 10))
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return false
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function parseExtraction(raw: string): ExtractedStatement {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new StatementParseError('invalid-json', 'response is not valid JSON')
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new StatementParseError('bad-type', 'response root must be an object')
  }

  const txsRaw = req(obj, 'transactions', 'statement')
  if (!Array.isArray(txsRaw)) {
    throw new StatementParseError('bad-type', 'statement.transactions must be an array')
  }
  if (txsRaw.length > 5000) {
    throw new StatementParseError('bad-type', `too many transactions (${txsRaw.length})`)
  }

  // Lenient JSON-mode endpoints may ignore the schema. Repair safe variants,
  // but reject unreadable rows so a partial statement is never imported.
  const transactions: ExtractedTransaction[] = []

  for (let i = 0; i < txsRaw.length; i++) {
    const t = txsRaw[i]
    if (t === null || typeof t !== 'object' || Array.isArray(t)) {
      throw new StatementParseError('bad-type', `transactions[${i}] must be an object`)
    }
    const tx = t as Record<string, unknown>

    // Amount: tolerate a signed value from the model, but 0/absent is not a transaction.
    const amountRaw = tx.amount
    const amount =
      typeof amountRaw === 'number' && Number.isFinite(amountRaw) ? Math.abs(amountRaw) : NaN
    const date = tx.date
    const dateOk = typeof date === 'string' && isValidCalendarDate(date)
    if (!dateOk || !(amount > 0)) {
      throw new StatementParseError('bad-type', `transactions[${i}] needs a valid date and amount`)
    }

    // Direction/kind are cross-repairable; if neither is usable the row is unreadable.
    let direction: 'debit' | 'credit' | null =
      tx.direction === 'debit' || tx.direction === 'credit' ? tx.direction : null
    const kindRaw = tx.kind
    let kind: ExtractedKind | null =
      typeof kindRaw === 'string' && EXTRACTED_KINDS.includes(kindRaw as ExtractedKind)
        ? (kindRaw as ExtractedKind)
        : null
    if (!direction && kind) {
      direction =
        kind === 'purchase' || kind === 'fee' ? 'debit' : kind === 'transfer' ? null : 'credit'
    }
    if (!kind && direction) {
      kind = direction === 'debit' ? 'purchase' : 'income'
    }
    if (!direction || !kind) {
      throw new StatementParseError('bad-type', `transactions[${i}] needs a direction and kind`)
    }

    // Confidence is a triage signal only — an unusable value means "assume worst".
    const confidenceRaw = tx.confidence
    const confidence: 'high' | 'medium' | 'low' =
      confidenceRaw === 'high' || confidenceRaw === 'medium' || confidenceRaw === 'low'
        ? confidenceRaw
        : 'low'

    // pending: coerce common truthy spellings from JSON-mode models.
    const pendingRaw = tx.pending
    const pending =
      pendingRaw === true || pendingRaw === 'true' || pendingRaw === 'yes' || pendingRaw === 1

    const categoryIdRaw = tx.categoryId

    transactions.push({
      date,
      description: typeof tx.description === 'string' ? tx.description : '',
      merchant: typeof tx.merchant === 'string' ? tx.merchant : '',
      amount,
      direction,
      kind,
      pending,
      confidence,
      categoryId: typeof categoryIdRaw === 'string' && categoryIdRaw ? categoryIdRaw : null,
    })
  }

  // Statement metadata: fully lenient. Display strings default to '', balances
  // and currency degrade to null (UI falls back to the account currency and
  // hides the reconcile banner) — a missing field must not fail the import.
  const openingBalance = obj.openingBalance
  const closingBalance = obj.closingBalance
  const currencyRaw = obj.currency

  return {
    bankName: typeof obj.bankName === 'string' ? obj.bankName : '',
    accountHint: typeof obj.accountHint === 'string' ? obj.accountHint : '',
    periodStart: typeof obj.periodStart === 'string' ? obj.periodStart : '',
    periodEnd: typeof obj.periodEnd === 'string' ? obj.periodEnd : '',
    currency:
      typeof currencyRaw === 'string' && currencyRaw.trim()
        ? currencyRaw.trim().toUpperCase()
        : null,
    openingBalance:
      typeof openingBalance === 'number' && Number.isFinite(openingBalance) ? openingBalance : null,
    closingBalance:
      typeof closingBalance === 'number' && Number.isFinite(closingBalance) ? closingBalance : null,
    transactions,
  }
}

// --- Review row derivation ---

export function normalizeMerchant(desc: string): string {
  return desc
    .replace(/[#*]+/g, ' ')
    .replace(/[-–—]+/g, ' ')
    .replace(/\b\w*\d\w*\b/g, ' ') // card numbers, dates, reference codes
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function deriveType(kind: ExtractedKind): TransactionKind {
  if (kind === 'purchase' || kind === 'fee') return 'expense'
  if (kind === 'income' || kind === 'refund' || kind === 'interest') return 'income'
  return 'transfer'
}

/** Grouping/dedup key for a row's merchant — shared by review UI and dedup. */
export function merchantKey(row: ExtractedTransaction): string {
  return normalizeMerchant(row.merchant || row.description).toLowerCase()
}

export function buildReviewRows(
  extraction: ExtractedStatement,
  categories: Category[],
  accountCurrency?: string,
): ImportReviewRow[] {
  const categoryIds = new Set(categories.map((c) => c.id))
  const seen = new Set<string>()

  return extraction.transactions.map((tx, index) => {
    const flags: ImportReviewRow['flags'] = []
    let included = true

    if (tx.pending) {
      flags.push('pending')
      included = false
    }

    const key = `${tx.date}|${tx.amount}|${merchantKey(tx)}`
    if (seen.has(key)) {
      flags.push('duplicate')
      included = false
    } else {
      seen.add(key)
    }

    if (tx.confidence === 'low') flags.push('lowConfidence')

    const type = deriveType(tx.kind)
    if (
      type === 'transfer' &&
      extraction.currency &&
      accountCurrency &&
      extraction.currency !== accountCurrency
    ) {
      flags.push('fxTransfer')
      included = false
    }
    // Keep the caller's category only if it exists and matches the row type.
    const wantedType = type === 'income' ? 'income' : 'expense'
    const category =
      tx.categoryId && categoryIds.has(tx.categoryId)
        ? categories.find((c) => c.id === tx.categoryId && c.type === wantedType)
        : undefined

    if (type !== 'transfer' && !category) flags.push('uncategorized')

    return {
      id: `row-${index}`,
      extraction: tx,
      type,
      categoryId: category?.id ?? null,
      counterpartAccountId: null,
      included,
      flags,
    }
  })
}

export interface ReconcileResult {
  expected: number
  actual: number
  diff: number
  ok: boolean
}

export function reconcileBalance(
  rows: ImportReviewRow[],
  opening: number,
  closing: number,
): ReconcileResult {
  const actual =
    opening +
    rows
      // Same predicate as the importer: every included row will be inserted,
      // including pending rows the user re-included.
      .filter((r) => r.included)
      .reduce(
        (sum, r) =>
          sum + (r.extraction.direction === 'debit' ? -r.extraction.amount : r.extraction.amount),
        0,
      )
  const diff = Math.round((closing - actual) * 100) / 100
  return {
    expected: closing,
    actual: Math.round(actual * 100) / 100,
    diff,
    ok: Math.abs(diff) < 0.01,
  }
}

export interface ImportPlan {
  /** Every row, including both legs of each transfer, is one atomic write. */
  transactions: ImportTransaction[]
}

/**
 * Builds one retry-safe batch. The caller supplies UUIDs so this lib function
 * stays pure; the same plan must be reused for each retry.
 */
export function planImport(
  rows: ImportReviewRow[],
  accounts: { id: string; currency: string }[],
  accountId: string,
  statementCurrency: string,
  makeId: () => string,
): ImportPlan {
  const transactions: ImportTransaction[] = []
  const source = accounts.find((a) => a.id === accountId)

  for (const row of rows) {
    if (!row.included) continue
    const date = new Date(row.extraction.date)
    const description = row.extraction.description || undefined

    if (row.type === 'transfer') {
      const counterpart = accounts.find((a) => a.id === row.counterpartAccountId)
      if (
        !source ||
        source.currency !== statementCurrency ||
        !counterpart ||
        counterpart.currency !== statementCurrency
      ) {
        throw new Error('Transfer requires two accounts in the statement currency')
      }

      const transferId = makeId()
      const outId = makeId()
      const inId = makeId()
      const debit = row.extraction.direction === 'debit'
      transactions.push(
        {
          id: outId,
          accountId: debit ? accountId : counterpart.id,
          type: 'transfer',
          amount: -row.extraction.amount,
          currency: statementCurrency,
          date,
          description,
          categoryId: row.categoryId,
          transferId,
          correlativeId: inId,
        },
        {
          id: inId,
          accountId: debit ? counterpart.id : accountId,
          type: 'transfer',
          amount: row.extraction.amount,
          currency: statementCurrency,
          date,
          description,
          categoryId: row.categoryId,
          transferId,
          correlativeId: outId,
        },
      )
    } else {
      transactions.push({
        id: makeId(),
        accountId,
        type: row.type,
        amount: row.extraction.amount,
        currency: statementCurrency,
        date,
        description,
        categoryId: row.categoryId,
      })
    }
  }

  return { transactions }
}
