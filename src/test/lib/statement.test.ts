import { describe, it, expect } from 'vitest'
import {
  buildExtractionMessages,
  buildReviewRows,
  deriveType,
  merchantKey,
  normalizeMerchant,
  parseExtraction,
  planImport,
  reconcileBalance,
  StatementParseError,
  EXTRACTION_RESPONSE_FORMAT,
} from '@/lib/statement'
import type { Category, ExtractedStatement, ImportReviewRow } from '@/types'

const categories: Category[] = [
  {
    id: 'cat-g',
    name: 'Groceries',
    type: 'expense',
    color: '#111111',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'cat-s',
    name: 'Salary',
    type: 'income',
    color: '#222222',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

function makeTx(overrides: Partial<ExtractedStatement['transactions'][number]> = {}) {
  return {
    date: '2025-01-02',
    description: 'WHOLE FOODS MARKET 5533',
    merchant: 'WHOLE FOODS MARKET',
    amount: 30,
    direction: 'debit' as const,
    kind: 'purchase' as const,
    pending: false,
    confidence: 'high' as const,
    categoryId: null,
    ...overrides,
  }
}

function makeStatement(overrides: Partial<ExtractedStatement> = {}): ExtractedStatement {
  return {
    bankName: 'Test Bank',
    accountHint: '••1234',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    currency: 'USD',
    openingBalance: 100,
    closingBalance: 30,
    transactions: [],
    ...overrides,
  }
}

const accounts = [
  { id: 'acc-1', currency: 'USD' },
  { id: 'acc-2', currency: 'USD' },
  { id: 'acc-3', currency: 'EUR' },
]

describe('deriveType', () => {
  it('maps kinds to transaction types', () => {
    expect(deriveType('purchase')).toBe('expense')
    expect(deriveType('fee')).toBe('expense')
    expect(deriveType('income')).toBe('income')
    expect(deriveType('refund')).toBe('income')
    expect(deriveType('interest')).toBe('income')
    expect(deriveType('transfer')).toBe('transfer')
  })
})

describe('buildReviewRows id injection', () => {
  it('uses the injected id factory', () => {
    let n = 0
    const rows = buildReviewRows(
      makeStatement({ transactions: [makeTx(), makeTx({ merchant: 'OTHER' })] }),
      categories,
      () => `id-${++n}`,
    )
    expect(rows.map((r) => r.id)).toEqual(['id-1', 'id-2'])
  })
})

describe('merchantKey', () => {
  it('normalizes merchant or description to a stable group key', () => {
    expect(merchantKey(makeTx({ merchant: 'WHOLE FOODS MARKET 5533' }))).toBe('whole foods market')
    expect(merchantKey(makeTx({ merchant: '', description: 'COFFEE SHOP #12' }))).toBe(
      'coffee shop',
    )
  })
})

describe('normalizeMerchant', () => {
  it('strips card numbers, dates and reference codes', () => {
    expect(normalizeMerchant('WHOLE FOODS MARKET 5533')).toBe('WHOLE FOODS MARKET')
    expect(normalizeMerchant('POS 2024-01-15 STORE')).toBe('POS STORE')
    expect(normalizeMerchant('AMZN MKTP US*2Y34K3')).toBe('AMZN MKTP US')
  })

  it('collapses whitespace', () => {
    expect(normalizeMerchant('  MULTI   SPACE  ')).toBe('MULTI SPACE')
  })
})

describe('buildReviewRows', () => {
  it('flags pending rows and pre-excludes them', () => {
    const rows = buildReviewRows(
      makeStatement({ transactions: [makeTx({ pending: true })] }),
      categories,
    )
    expect(rows[0].flags).toContain('pending')
    expect(rows[0].included).toBe(false)
  })

  it('flags within-upload duplicates (all but first) and excludes them', () => {
    const tx = makeTx()
    const rows = buildReviewRows(makeStatement({ transactions: [tx, { ...tx }] }), categories)
    expect(rows[0].flags).not.toContain('duplicate')
    expect(rows[1].flags).toContain('duplicate')
    expect(rows[1].included).toBe(false)
  })

  it('ignores merchant digit noise when matching duplicates', () => {
    const rows = buildReviewRows(
      makeStatement({
        transactions: [makeTx(), makeTx({ description: 'WHOLE FOODS MARKET 9999' })],
      }),
      categories,
    )
    expect(rows[1].flags).toContain('duplicate')
  })

  it('flags low confidence rows', () => {
    const rows = buildReviewRows(
      makeStatement({ transactions: [makeTx({ confidence: 'low' })] }),
      categories,
    )
    expect(rows[0].flags).toContain('lowConfidence')
    expect(rows[0].included).toBe(true)
  })

  it('flags uncategorized income/expense rows but not transfers', () => {
    const rows = buildReviewRows(
      makeStatement({
        transactions: [
          makeTx({ categoryId: null }),
          makeTx({ kind: 'transfer', merchant: 'TRANSFER TO SAVINGS', categoryId: null }),
        ],
      }),
      categories,
    )
    expect(rows[0].flags).toContain('uncategorized')
    expect(rows[1].flags).not.toContain('uncategorized')
    expect(rows[1].type).toBe('transfer')
  })

  it('drops category ids that do not exist or mismatch the row type', () => {
    const rows = buildReviewRows(
      makeStatement({
        transactions: [
          makeTx({ categoryId: 'ghost' }),
          makeTx({ categoryId: 'cat-s', description: 'ACME PAYROLL', merchant: 'ACME PAYROLL' }),
        ],
      }),
      categories,
    )
    expect(rows[0].categoryId).toBeNull()
    expect(rows[0].flags).toContain('uncategorized')
    expect(rows[1].categoryId).toBeNull()
  })

  it('keeps a matching category', () => {
    const rows = buildReviewRows(
      makeStatement({ transactions: [makeTx({ categoryId: 'cat-g' })] }),
      categories,
    )
    expect(rows[0].categoryId).toBe('cat-g')
    expect(rows[0].flags).not.toContain('uncategorized')
  })
})

describe('reconcileBalance', () => {
  function rowOf(direction: 'debit' | 'credit', amount: number, included = true): ImportReviewRow {
    const [row] = buildReviewRows(
      makeStatement({ transactions: [makeTx({ direction, amount })] }),
      categories,
    )
    return { ...row, included }
  }

  it('reconciles when included signed rows reach the closing balance', () => {
    const result = reconcileBalance([rowOf('debit', 70)], 100, 30)
    expect(result.ok).toBe(true)
    expect(result.actual).toBe(30)
  })

  it('reports a diff when rows are excluded', () => {
    const result = reconcileBalance([rowOf('debit', 70, false)], 100, 30)
    expect(result.ok).toBe(false)
    expect(result.diff).toBe(-70)
  })

  it('treats credits as inflows', () => {
    const result = reconcileBalance([rowOf('credit', 50)], 100, 150)
    expect(result.ok).toBe(true)
  })

  it('counts re-included pending rows, matching the importer', () => {
    const [row] = buildReviewRows(
      makeStatement({ transactions: [makeTx({ pending: true, amount: 70 })] }),
      categories,
    )
    const result = reconcileBalance([{ ...row, included: true }], 100, 30)
    expect(result.ok).toBe(true)
  })
})

describe('planImport', () => {
  function reviewRow(overrides: Partial<ImportReviewRow>): ImportReviewRow {
    const [row] = buildReviewRows(makeStatement({ transactions: [makeTx()] }), categories)
    return { ...row, ...overrides }
  }

  it('builds a plain expense row with statement currency and positive amount', () => {
    const plan = planImport([reviewRow({ categoryId: 'cat-g' })], accounts, 'acc-1', 'USD')
    expect(plan.transfers).toHaveLength(0)
    expect(plan.transactions).toHaveLength(1)
    expect(plan.transactions[0]).toMatchObject({
      accountId: 'acc-1',
      type: 'expense',
      amount: 30,
      currency: 'USD',
      categoryId: 'cat-g',
    })
  })

  it('plans a debit transfer with the statement account as source', () => {
    const plan = planImport(
      [
        reviewRow({
          type: 'transfer',
          extraction: makeTx({ kind: 'transfer', merchant: 'TRANSFER', amount: 40 }),
          counterpartAccountId: 'acc-2',
          categoryId: null,
        }),
      ],
      accounts,
      'acc-1',
      'USD',
    )
    expect(plan.transactions).toHaveLength(0)
    expect(plan.transfers).toHaveLength(1)
    expect(plan.transfers[0]).toMatchObject({
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 40,
      currency: 'USD',
    })
  })

  it('plans a credit transfer with the statement account as destination', () => {
    const plan = planImport(
      [
        reviewRow({
          type: 'transfer',
          extraction: makeTx({
            kind: 'transfer',
            merchant: 'TRANSFER IN',
            direction: 'credit',
            amount: 40,
          }),
          counterpartAccountId: 'acc-2',
          categoryId: null,
        }),
      ],
      accounts,
      'acc-1',
      'USD',
    )
    expect(plan.transfers[0]).toMatchObject({
      fromAccountId: 'acc-2',
      toAccountId: 'acc-1',
      amount: 40,
    })
  })

  it('skips transfers without a counterpart or with an FX mismatch', () => {
    const plan = planImport(
      [
        reviewRow({ type: 'transfer', counterpartAccountId: null }),
        reviewRow({
          type: 'transfer',
          extraction: makeTx({ kind: 'transfer', amount: 10 }),
          counterpartAccountId: 'acc-3', // EUR — FX transfer
        }),
      ],
      accounts,
      'acc-1',
      'USD',
    )
    expect(plan.transactions).toHaveLength(0)
    expect(plan.transfers).toHaveLength(0)
  })

  it('skips excluded rows', () => {
    const plan = planImport([reviewRow({ included: false })], accounts, 'acc-1', 'USD')
    expect(plan.transactions).toHaveLength(0)
    expect(plan.transfers).toHaveLength(0)
  })
})

describe('buildExtractionMessages', () => {
  it('includes category ids and account currency in the prompt', () => {
    const { system, user } = buildExtractionMessages(
      'STATEMENT TEXT HERE',
      categories,
      'Checking',
      'USD',
    )
    expect(system).toContain('JSON')
    expect(user).toContain('cat-g')
    expect(user).toContain('cat-s')
    expect(user).toContain('currency: USD')
    expect(user).toContain('STATEMENT TEXT HERE')
  })

  it('exposes a strict json_schema response format', () => {
    expect(EXTRACTION_RESPONSE_FORMAT.type).toBe('json_schema')
    expect(EXTRACTION_RESPONSE_FORMAT.json_schema.strict).toBe(true)
    expect(EXTRACTION_RESPONSE_FORMAT.json_schema.schema.required).toContain('transactions')
  })
})

describe('parseExtraction', () => {
  const valid = {
    bankName: 'Test Bank',
    accountHint: '••1234',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    currency: 'USD',
    openingBalance: 100,
    closingBalance: 30,
    transactions: [
      {
        date: '2025-01-02',
        description: 'COFFEE',
        merchant: 'COFFEE SHOP',
        amount: 4.5,
        direction: 'debit',
        kind: 'purchase',
        pending: false,
        confidence: 'high',
        categoryId: null,
      },
    ],
  }

  it('parses a valid payload', () => {
    const parsed = parseExtraction(JSON.stringify(valid))
    expect(parsed.bankName).toBe('Test Bank')
    expect(parsed.transactions[0].amount).toBe(4.5)
    expect(parsed.transactions[0].direction).toBe('debit')
  })

  it('rejects invalid JSON', () => {
    expect(() => parseExtraction('not json')).toThrow(StatementParseError)
    try {
      parseExtraction('not json')
    } catch (err) {
      expect((err as StatementParseError).reason).toBe('invalid-json')
    }
  })

  it('rejects missing transactions array', () => {
    const rest: Record<string, unknown> = { ...valid }
    delete rest.transactions
    expect(() => parseExtraction(JSON.stringify(rest))).toThrow(/missing-field/)
  })

  it('skips unreadable rows and reports the count instead of failing', () => {
    const parsed = parseExtraction(
      JSON.stringify({
        ...valid,
        transactions: [
          { ...valid.transactions[0], amount: '4.5' }, // not a number
          { ...valid.transactions[0], date: '2025-13-45' }, // implausible date
          { ...valid.transactions[0], date: '2025-02-31' }, // impossible calendar date
          { ...valid.transactions[0], direction: 'sideways' }, // repaired via kind: purchase → debit
          { date: 'nope', amount: 1, direction: 'debit', kind: 'purchase' },
          'garbage',
        ],
      }),
    )
    expect(parsed.skippedCount).toBe(5)
    expect(parsed.transactions).toHaveLength(1)
    expect(parsed.transactions[0]).toMatchObject({ direction: 'debit', kind: 'purchase' })
    expect(parsed.transactions[0]).toMatchObject({ direction: 'debit', kind: 'purchase' })
  })

  it('repairs salvageable rows from lenient JSON-mode models', () => {
    const parsed = parseExtraction(
      JSON.stringify({
        ...valid,
        transactions: [
          // The DeepSeek failure: confidence is null.
          { ...valid.transactions[0], confidence: null },
          // Negative amounts are absolute-value candidates.
          { ...valid.transactions[0], amount: -4.5, description: 'NEG' },
          // String booleans from JSON-mode models.
          { ...valid.transactions[0], pending: 'yes', description: 'PENDING' },
          // Missing kind, inferable from direction.
          { ...valid.transactions[0], kind: null, description: 'NOKIND' },
        ],
      }),
    )
    expect(parsed.skippedCount).toBe(0)
    expect(parsed.transactions).toHaveLength(4)
    expect(parsed.transactions[0].confidence).toBe('low')
    expect(parsed.transactions[1].amount).toBe(4.5)
    expect(parsed.transactions[2].pending).toBe(true)
    expect(parsed.transactions[3].kind).toBe('purchase')
  })

  it('tolerates missing statement balances and currency instead of failing', () => {
    const parsed = parseExtraction(
      JSON.stringify({ ...valid, openingBalance: 'missing', closingBalance: null, currency: '' }),
    )
    expect(parsed.openingBalance).toBeNull()
    expect(parsed.closingBalance).toBeNull()
    expect(parsed.currency).toBeNull()
    expect(parsed.transactions).toHaveLength(1)
  })

  it('normalizes the currency code to upper-case', () => {
    expect(parseExtraction(JSON.stringify(valid)).currency).toBe('USD')
    expect(parseExtraction(JSON.stringify({ ...valid, currency: 'usd' })).currency).toBe('USD')
  })
})
