import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/services/pdfExtract', () => ({
  extractPdfText: vi.fn(),
  PdfPasswordError: class PdfPasswordError extends Error {
    constructor() {
      super('This PDF is password-protected. Remove the password and try again.')
    }
  },
  PdfNoTextError: class PdfNoTextError extends Error {
    constructor() {
      super('No text found in this PDF — it may be a scanned image, which is not supported.')
    }
  },
  PdfTooManyPagesError: class PdfTooManyPagesError extends Error {
    constructor() {
      super('PDF has too many pages.')
    }
  },
}))

vi.mock('@/services/llm', () => ({
  extractStatement: vi.fn(),
  testAiConnection: vi.fn(),
}))

import StatementImport from '@/pages/StatementImport'
import { extractPdfText, PdfNoTextError } from '@/services/pdfExtract'
import { extractStatement } from '@/services/llm'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { getTable } from '@/test/supabase-mock'
import type { ExtractedStatement } from '@/types'

const realStoreActions = {
  bulkAdd: useTransactionsStore.getState().bulkAdd,
  createTransfer: useTransactionsStore.getState().createTransfer,
}

vi.mocked(extractPdfText).mockResolvedValue({ text: 'STATEMENT TEXT', pages: 1, truncated: false })

const statementFixture: ExtractedStatement = {
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
      description: 'WHOLE FOODS MARKET 5533',
      merchant: 'WHOLE FOODS MARKET',
      amount: 30,
      direction: 'debit',
      kind: 'purchase',
      pending: false,
      confidence: 'high',
      categoryId: 'cat-g',
    },
    {
      date: '2025-01-03',
      description: 'TRANSFER TO SAVINGS',
      merchant: 'TRANSFER',
      amount: 40,
      direction: 'debit',
      kind: 'transfer',
      pending: false,
      confidence: 'medium',
      categoryId: null,
    },
    {
      date: '2025-01-03',
      description: 'UBER TRIP PENDING',
      merchant: 'UBER',
      amount: 5,
      direction: 'debit',
      kind: 'purchase',
      pending: true,
      confidence: 'low',
      categoryId: null,
    },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StatementImport />
    </MemoryRouter>,
  )
}

const pdfFile = new File(['%PDF-1.4 fake'], 'statement.pdf', { type: 'application/pdf' })

async function uploadAndProcess(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByTestId('statement-file-input'), pdfFile)
  await user.click(screen.getByTestId('account-select'))
  await user.click(await screen.findByRole('option', { name: /Checking/ }))
  await user.click(screen.getByRole('button', { name: /Process statement/ }))
}

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  useSettingsStore.getState().reset()
  useSettingsStore.setState({ aiApiKey: 'sk-test' })
  useAccountsStore.setState({ accounts: [], loading: false, error: null, _unsub: null })
  useCategoriesStore.setState({ categories: [], loading: false, error: null, _unsub: null })
  useTransactionsStore.setState({
    transactions: [],
    loading: false,
    error: null,
    _unsub: null,
    ...realStoreActions,
  })
  getTable('accounts').push(
    { id: 'acc-1', name: 'Checking', type: 'checking', currency: 'USD', balance: 100 },
    { id: 'acc-2', name: 'Savings', type: 'savings', currency: 'USD', balance: 0 },
  )
  getTable('categories').push(
    { id: 'cat-g', name: 'Groceries', type: 'expense', color: '#111111' },
    { id: 'cat-s', name: 'Salary', type: 'income', color: '#222222' },
  )
  vi.mocked(extractStatement).mockResolvedValue(structuredClone(statementFixture))
})

describe('StatementImport', () => {
  it('gates the flow without an API key', async () => {
    useSettingsStore.setState({ aiApiKey: undefined })
    renderPage()

    expect(await screen.findByText('AI extraction not configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Process statement/ })).toBeDisabled()
  })

  it('accepts a dropped PDF and rejects other file types', () => {
    renderPage()
    const dropzone = screen.getByText(/drag & drop/).closest('label')!

    fireEvent.drop(dropzone, { dataTransfer: { files: [pdfFile] } })
    expect(screen.getByText('statement.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Only PDF files are supported')).not.toBeInTheDocument()

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    })
    expect(screen.getByText('Only PDF files are supported')).toBeInTheDocument()
  })

  it('shows the privacy note about sending statement text to the AI endpoint', () => {
    renderPage()
    expect(screen.getByText(/statement text is sent to the AI endpoint/i)).toBeInTheDocument()
  })

  it('runs the happy path to review and shows groups and flags', async () => {
    const user = userEvent.setup()
    renderPage()
    await uploadAndProcess(user)

    // Merchant groups render
    expect(await screen.findByText('WHOLE FOODS MARKET')).toBeInTheDocument()
    expect(screen.getByText('TRANSFER')).toBeInTheDocument()
    expect(screen.getByText('UBER')).toBeInTheDocument()

    // Flag badges
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Low confidence')).toBeInTheDocument()

    // Extract was called with the pdf text, categories, and the chosen account
    expect(extractStatement).toHaveBeenCalledWith(
      { aiApiKey: 'sk-test', aiModel: 'gpt-4o-mini', aiBaseUrl: '' },
      'STATEMENT TEXT',
      expect.anything(),
      expect.objectContaining({ name: 'Checking', currency: 'USD' }),
    )
  })

  it('disables confirm while an included transfer lacks a counterpart, then bulk-adds on confirm', async () => {
    const bulkSpy = vi.spyOn(useTransactionsStore.getState(), 'bulkAdd').mockResolvedValue([])
    const user = userEvent.setup()
    renderPage()
    await uploadAndProcess(user)

    const confirmButton = await screen.findByRole('button', { name: /Add \d+ transactions?/ })
    expect(confirmButton).toBeDisabled()

    // Exclude the counterpart-less transfer group → confirm unlocks with 1 row
    await user.click(screen.getByRole('button', { name: 'Exclude all TRANSFER' }))
    const enabled = screen.getByRole('button', { name: 'Add 1 transaction' })
    expect(enabled).toBeEnabled()
    await user.click(enabled)

    expect(bulkSpy).toHaveBeenCalledTimes(1)
    expect(bulkSpy.mock.calls[0][0]).toHaveLength(1)
    expect(bulkSpy.mock.calls[0][0][0]).toMatchObject({
      accountId: 'acc-1',
      type: 'expense',
      amount: 30,
      currency: 'USD',
      categoryId: 'cat-g',
    })
  })

  it('submits plain rows and linked transfer legs in one batch', async () => {
    const originalBulkAdd = realStoreActions.bulkAdd
    const bulkSpy = vi
      .spyOn(useTransactionsStore.getState(), 'bulkAdd')
      .mockImplementation((...args) => originalBulkAdd(...args))
    const transferSpy = vi
      .spyOn(useTransactionsStore.getState(), 'createTransfer')
      .mockResolvedValue([])
    const user = userEvent.setup()
    renderPage()
    await uploadAndProcess(user)

    // Pick the counterpart for the transfer group ( Radix select )
    const counterpartTrigger = await screen.findByRole('combobox', {
      name: 'Counterpart account',
    })
    await user.click(counterpartTrigger)
    await user.click(await screen.findByRole('option', { name: /Savings/ }))

    // 1 expense + 2 transfer legs
    await user.click(screen.getByRole('button', { name: 'Add 3 transactions' }))

    expect(bulkSpy).toHaveBeenCalledTimes(1)
    expect(bulkSpy.mock.calls[0][0]).toHaveLength(3)
    const transfers = bulkSpy.mock.calls[0][0].filter((row) => row.type === 'transfer')
    expect(transfers).toHaveLength(2)
    expect(transfers[0].transferId).toBeTruthy()
    expect(transfers[0].transferId).toBe(transfers[1].transferId)
    expect(transferSpy).not.toHaveBeenCalled()
    const persisted = getTable('transactions')
    expect(persisted).toHaveLength(3)
    const persistedTransfers = persisted.filter((row) => row.type === 'transfer')
    expect(persistedTransfers[0].correlative_id).toBe(persistedTransfers[1].id)
    expect(persistedTransfers[1].correlative_id).toBe(persistedTransfers[0].id)
  })

  it('retries a committed batch without duplicating rows after its response is lost', async () => {
    const originalBulkAdd = realStoreActions.bulkAdd
    const bulkSpy = vi.spyOn(useTransactionsStore.getState(), 'bulkAdd')
    bulkSpy.mockImplementationOnce(async (...args) => {
      await originalBulkAdd(...args)
      throw new Error('response lost')
    })
    bulkSpy.mockImplementation((...args) => originalBulkAdd(...args))
    vi.mocked(extractStatement).mockResolvedValue({
      ...structuredClone(statementFixture),
      transactions: [statementFixture.transactions[0]],
    })

    const user = userEvent.setup()
    renderPage()
    await uploadAndProcess(user)
    await user.click(await screen.findByRole('button', { name: 'Add 1 transaction' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('response lost')
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Retry import' }))
    expect(await screen.findByText('Added 1 transaction')).toBeInTheDocument()
    expect(getTable('transactions')).toHaveLength(1)
  })

  it('pre-excludes FX transfers so other statement rows can be imported', async () => {
    vi.mocked(extractStatement).mockResolvedValue({
      ...structuredClone(statementFixture),
      currency: 'EUR',
    })
    const user = userEvent.setup()
    renderPage()
    await uploadAndProcess(user)

    expect(await screen.findByRole('checkbox', { name: /Include TRANSFER/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Add 1 transaction' })).toBeEnabled()
  })

  it('surfaces confirm failures and stays on review', async () => {
    vi.spyOn(useTransactionsStore.getState(), 'bulkAdd').mockRejectedValue(
      new Error('insert failed'),
    )
    const user = userEvent.setup()
    renderPage()
    await uploadAndProcess(user)

    await user.click(await screen.findByRole('button', { name: 'Exclude all TRANSFER' }))
    await user.click(screen.getByRole('button', { name: 'Add 1 transaction' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('insert failed')
    // Still on review — rows intact for retry.
    expect(screen.getByText('WHOLE FOODS MARKET')).toBeInTheDocument()
  })

  it('shows triage copy for a scanned PDF and never reaches the LLM', async () => {
    vi.mocked(extractPdfText).mockRejectedValueOnce(new PdfNoTextError())
    const user = userEvent.setup()
    renderPage()
    await uploadAndProcess(user)

    expect(await screen.findByText(/may be a scanned image/i)).toBeInTheDocument()
    expect(extractStatement).not.toHaveBeenCalled()
  })

  it('shows a generic error for LLM failures', async () => {
    vi.mocked(extractStatement).mockRejectedValueOnce(new Error('AI request failed (500)'))
    const user = userEvent.setup()
    renderPage()
    await uploadAndProcess(user)

    expect(await screen.findByText(/AI request failed \(500\)/)).toBeInTheDocument()
  })
})
