import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { extractPdfText } from '@/services/pdfExtract'
import {
  buildReviewRows,
  merchantKey,
  normalizeMerchant,
  planImport,
  reconcileBalance,
  type ReconcileResult,
} from '@/lib/statement'
import { extractStatement } from '@/services/llm'
import type { ExtractedStatement, ImportReviewRow, ReviewFlag } from '@/types'
import { UploadStep } from '@/pages/statementimport/UploadStep'
import { ProcessingStep } from '@/pages/statementimport/ProcessingStep'
import { ReviewStep } from '@/pages/statementimport/ReviewStep'
import { DoneStep } from '@/pages/statementimport/DoneStep'

type Step = 'setup' | 'processing' | 'review' | 'done'

export interface RowGroup {
  key: string
  label: string
  rows: ImportReviewRow[]
}

function groupKeyOf(row: ImportReviewRow): string {
  return merchantKey(row.extraction)
}

export default function StatementImport() {
  const navigate = useNavigate()
  const accounts = useAccountsStore((s) => s.accounts)
  const loadAccounts = useAccountsStore((s) => s.load)
  const categories = useCategoriesStore((s) => s.categories)
  const loadCategories = useCategoriesStore((s) => s.load)
  const bulkAdd = useTransactionsStore((s) => s.bulkAdd)
  const createTransfer = useTransactionsStore((s) => s.createTransfer)
  const aiApiKey = useSettingsStore((s) => s.aiApiKey)
  const aiModel = useSettingsStore((s) => s.aiModel)
  const aiBaseUrl = useSettingsStore((s) => s.aiBaseUrl)

  const [step, setStep] = useState<Step>('setup')
  const [stage, setStage] = useState<'pdf' | 'ai'>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [accountId, setAccountId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const [statement, setStatement] = useState<ExtractedStatement | null>(null)
  const [rows, setRows] = useState<ImportReviewRow[]>([])
  const [truncated, setTruncated] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  // Tracks what the current confirm attempt has already persisted, so a retry
  // after a mid-flow failure never inserts the same rows twice.
  const confirmProgress = useRef({ plainInserted: false, transfersDone: new Set<string>() })
  const transferKeys = useRef(new Map<string, string>())

  const [addedCount, setAddedCount] = useState(0)
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null)

  useEffect(() => {
    loadAccounts()
    loadCategories()
  }, [loadAccounts, loadCategories])

  // Unload warning while work is in progress (ephemeral state would be lost).
  useEffect(() => {
    if (step !== 'processing' && step !== 'review') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [step])

  const groups = useMemo<RowGroup[]>(() => {
    const map = new Map<string, ImportReviewRow[]>()
    for (const row of rows) {
      const key = groupKeyOf(row)
      const list = map.get(key)
      if (list) list.push(row)
      else map.set(key, [row])
    }
    const list: RowGroup[] = [...map.entries()].map(([key, groupRows]) => ({
      key,
      label:
        normalizeMerchant(
          groupRows[0].extraction.merchant || groupRows[0].extraction.description,
        ) || 'Unknown merchant',
      rows: groupRows,
    }))
    // Flagged ("needs attention") groups on top, then chronological.
    list.sort((a, b) => {
      const fa = a.rows.some((r) => r.flags.length > 0) ? 0 : 1
      const fb = b.rows.some((r) => r.flags.length > 0) ? 0 : 1
      if (fa !== fb) return fa - fb
      return a.rows[0].extraction.date.localeCompare(b.rows[0].extraction.date)
    })
    return list
  }, [rows])

  const reconcileResult = useMemo(
    () =>
      statement && statement.openingBalance !== null && statement.closingBalance !== null
        ? reconcileBalance(rows, statement.openingBalance, statement.closingBalance)
        : null,
    [rows, statement],
  )

  const account = accounts.find((a) => a.id === accountId)

  // Statement currency falls back to the account currency when the model
  // didn't return one; rows are recorded in this currency either way.
  const statementCurrency = statement?.currency ?? account?.currency ?? ''

  const confirmDisabled = useMemo(() => {
    if (!statement || !account) return true
    return rows.some((r) => {
      if (!r.included) return false
      // Dates/amounts are user-editable; invalid ones would fail the insert.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.extraction.date)) return true
      if (!(r.extraction.amount > 0)) return true
      if (r.type !== 'transfer') return r.flags.includes('uncategorized')
      // Spec pre-excludes FX transfers: both sides must be in statement currency.
      if (account.currency !== statementCurrency) return true
      const counterpart = accounts.find((a) => a.id === r.counterpartAccountId)
      return !counterpart || counterpart.currency !== statementCurrency
    })
  }, [rows, accounts, statement, statementCurrency, account])

  function patchRow(id: string, patch: Partial<ImportReviewRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function setRowCategory(row: ImportReviewRow, categoryId: string) {
    const flags: ReviewFlag[] = row.flags.filter((f) => f !== 'uncategorized')
    if (row.type !== 'transfer' && !categoryId) flags.push('uncategorized')
    patchRow(row.id, { categoryId: categoryId || null, flags })
  }

  function applyCategoryToGroup(key: string, categoryId: string) {
    const category = categories.find((c) => c.id === categoryId)
    setRows((prev) =>
      prev.map((r) => {
        // Never write an expense category onto an income row (or vice versa).
        if (groupKeyOf(r) !== key || r.type === 'transfer') return r
        if (category && r.type !== category.type) return r
        const flags: ReviewFlag[] = r.flags.filter((f) => f !== 'uncategorized')
        if (!categoryId) flags.push('uncategorized')
        return { ...r, categoryId: categoryId || null, flags }
      }),
    )
  }

  function setCounterpart(rowId: string, counterAccountId: string) {
    // Per-row choice; unset siblings in the same merchant group prefill from it.
    setRows((prev) => {
      const target = prev.find((r) => r.id === rowId)
      if (!target) return prev
      const key = groupKeyOf(target)
      return prev.map((r) =>
        r.type === 'transfer' &&
        groupKeyOf(r) === key &&
        (r.id === rowId || !r.counterpartAccountId)
          ? { ...r, counterpartAccountId: counterAccountId }
          : r,
      )
    })
  }

  async function handleProcess() {
    if (!file || !account) return
    setError(null)
    setStep('processing')
    setStage('pdf')
    try {
      const { text, truncated: wasTruncated } = await extractPdfText(file)
      setTruncated(wasTruncated)
      setStage('ai')
      const extraction = await extractStatement(
        { aiApiKey, aiModel, aiBaseUrl },
        text,
        categories,
        account,
      )
      setStatement(extraction)
      setRows(buildReviewRows(extraction, categories))
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStep('setup')
    }
  }

  async function handleConfirm() {
    if (!statement || confirming || !account) return
    setConfirming(true)
    setConfirmError(null)
    const { transactions: plain, transfers } = planImport(
      rows,
      accounts,
      accountId,
      statementCurrency,
    )
    try {
      // Each phase records progress before the next; retries reuse idempotency
      // keys (and skip finished phases), so no failure path can double-insert.
      if (!confirmProgress.current.plainInserted && plain.length > 0) {
        await bulkAdd(plain)
        confirmProgress.current.plainInserted = true
      }
      for (const t of transfers) {
        if (confirmProgress.current.transfersDone.has(t.rowId)) continue
        let key = transferKeys.current.get(t.rowId)
        if (!key) {
          key = crypto.randomUUID()
          transferKeys.current.set(t.rowId, key)
        }
        await createTransfer({
          idempotencyKey: key,
          fromAccountId: t.fromAccountId,
          toAccountId: t.toAccountId,
          amount: t.amount,
          convertedAmount: t.amount,
          categoryId: t.categoryId,
          date: t.date,
          description: t.description,
        })
        confirmProgress.current.transfersDone.add(t.rowId)
      }
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Failed to add transactions')
      setConfirming(false)
      return
    }
    // Inserts succeeded - never offer a re-insert from here. Balance refresh is
    // best-effort: the server trigger already applied the effects.
    try {
      await loadAccounts()
    } catch {
      // Balances refresh on next store load.
    }
    setAddedCount(plain.length + transfers.length * 2)
    setReconcile(reconcileResult)
    setStep('done')
    setConfirming(false)
  }

  function reset() {
    setStep('setup')
    setFile(null)
    setStatement(null)
    setRows([])
    setTruncated(false)
    setConfirmError(null)
    setError(null)
    confirmProgress.current = { plainInserted: false, transfersDone: new Set() }
    transferKeys.current.clear()
  }

  if (step === 'processing') {
    return <ProcessingStep stage={stage} />
  }

  if (step === 'review' && statement && account) {
    return (
      <ReviewStep
        statement={statement}
        groups={groups}
        accounts={accounts}
        categories={categories}
        sourceAccountId={accountId}
        sourceAccountCurrency={account.currency}
        reconcile={reconcileResult}
        truncated={truncated}
        skippedCount={statement.skippedCount ?? 0}
        confirming={confirming}
        confirmError={confirmError}
        confirmDisabled={confirmDisabled}
        onUpdateRow={patchRow}
        onToggleGroup={(key, included) =>
          setRows((prev) => prev.map((r) => (groupKeyOf(r) === key ? { ...r, included } : r)))
        }
        onSetRowCategory={setRowCategory}
        onApplyCategoryToGroup={applyCategoryToGroup}
        onSetCounterpart={setCounterpart}
        onConfirm={handleConfirm}
        onDiscard={reset}
        onBack={() => navigate('/app/transactions')}
      />
    )
  }

  if (step === 'done') {
    return (
      <DoneStep
        count={addedCount}
        reconcile={reconcile}
        currency={statement?.currency ?? account?.currency}
        onBack={() => navigate('/app/transactions')}
      />
    )
  }

  return (
    <UploadStep
      accounts={accounts}
      hasKey={Boolean(aiApiKey)}
      file={file}
      onFile={setFile}
      accountId={accountId}
      onAccountChange={setAccountId}
      onProcess={handleProcess}
      error={error}
    />
  )
}
