# Bank Statement PDF Import (Auto-Bookkeeping)

## Goal

User uploads a bank statement PDF for one account → app extracts text client-side → OpenAI-compatible LLM (BYOK) extracts statement metadata + transactions and maps them to the user's existing categories → full-page review with batch-fix → confirmed rows are bulk-inserted (transfers as linked pairs). Ephemeral: nothing persisted but the resulting transactions.

## Locked product decisions (from grilling session)

- Recurring monthly flow; one PDF per session; ephemeral with unload warning; PDF discarded, no audit trail
- User picks account explicitly at upload; feature gated until API key is set (BYOK, OpenAI-compatible)
- Existing categories only (typed income/expense), user edits at review; no inline category creation
- Extract everything (spend/income/transfers/fees/refunds); user toggles at review
- Refunds/interest → income rows; pending rows pre-excluded; within-upload duplicates pre-excluded (review = only dedup checkpoint in v1)
- Transfers: counterpart account picker → two linked rows (v1 same-currency only; FX transfers pre-excluded)
- Review: merchant-grouped with batch-fix, per-row edit, flagged ("needs attention") rows on top, category required on included income/expense rows, balance reconciliation banner (warn, never block)
- Record original statement currency; warn on mismatch with account currency
- Bank-agnostic extraction; quality bar: end-to-end on a real statement, no golden test set (user QA/tunes after)
- CSV import flow stays untouched

## Approach summary

Pure client-side. No new tables, no edge functions, no schema changes. New dep: `pdfjs-dist` only (no LLM SDK — plain `fetch`).

Extraction chain: `services/pdfExtract.ts` uses lazy-imported `pdfjs-dist` → `lib/statement.ts` builds prompt + JSON schema → `services/llm.ts` chat completion with structured output → `parseExtraction` validates every row → `buildReviewRows` derives flags → review UI → `planImport` builds one batch with stable IDs → idempotent `bulkAdd`.

"Full-screen flow" = dedicated route page inside the standard app shell (sidebar stays, consistent with fixed-sidebar layout rule), reachable from a Transactions header button. Browser back works naturally.

## Key existing code to reuse

- `src/lib/csv.ts` — parsing precedent for `lib` purity and per-row parse helpers
- `src/pages/Transactions.tsx` — transfer-pair mechanics: outgoing `amount: -amount`, incoming `+amount`, paired by shared `transferId` and mutual `correlativeId`
- `src/stores/transactionsStore.ts` `bulkAdd(NewTransaction[], { idempotent: true })` — computes reporting-currency fields and writes the batch in one statement
- `src/stores/settingsStore.ts` — localStorage settings pattern to extend
- `src/pages/transactions/CsvImportDialog.tsx` — dumb-component wizard pattern (state lives in page)
- Migration fact: `transactions.transfer_id` tags both legs; `correlative_id` points to the other leg's ID. Client-generated row IDs make a single `bulkAdd` call retry-safe.

## File changes

### 1. `src/types/index.ts` (modify)

- Extend `UserSettings` with flat optional fields: `aiApiKey?: string`, `aiModel?: string`, `aiBaseUrl?: string` (flat = merges cleanly with existing `{ ...defaultSettings, ...JSON.parse(raw) }` load).
- Add domain types:

```ts
export type ExtractedKind = 'purchase' | 'income' | 'transfer' | 'fee' | 'refund' | 'interest'
export interface ExtractedTransaction {
  date: string // ISO yyyy-mm-dd
  description: string
  merchant: string
  amount: number // always positive
  direction: 'debit' | 'credit'
  kind: ExtractedKind
  pending: boolean
  confidence: 'high' | 'medium' | 'low'
  categoryId: string | null
}
export interface ExtractedStatement {
  bankName: string
  accountHint: string
  periodStart: string
  periodEnd: string
  currency: string | null // null if the model cannot identify it
  openingBalance: number | null
  closingBalance: number | null
  transactions: ExtractedTransaction[]
}
export type ReviewFlag = 'pending' | 'duplicate' | 'lowConfidence' | 'uncategorized' | 'fxTransfer'
export interface ImportReviewRow {
  id: string
  extraction: ExtractedTransaction
  type: TransactionKind
  categoryId: string | null
  counterpartAccountId: string | null // transfers only
  included: boolean
  flags: ReviewFlag[]
}
```

### 2. `src/stores/settingsStore.ts` (modify)

- Defaults: `aiModel: 'gpt-4o-mini'`, `aiBaseUrl: ''` (empty = official OpenAI).
- New setter `setAiSettings(patch)` following the existing save-then-set pattern.

### 3. `src/services/pdfExtract.ts` (new, side effects)

- `extractPdfText(file: File): Promise<{ text: string; pages: number }>` — dynamic `import('pdfjs-dist')` so the lib never touches the main bundle; worker via `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` + `GlobalWorkerOptions.workerSrc`.
- Constants `MAX_PDF_PAGES = 40`, `MAX_STATEMENT_CHARS = 60_000` (truncate text past cap, flag truncation in return value).
- Typed triage errors: `PdfPasswordError`, `PdfNoTextError` (page text empty across all pages), `PdfTooManyPagesError`.

### 4. `src/lib/statement.ts` (new, pure — the core)

- `buildExtractionMessages(text, categories, accountName, accountCurrency): { system, user }` — rules embedded: emit the JSON schema exactly; `categoryId` must be one of the provided `{id, name, type}` list or null (respect category `type`: income cats only for credit rows); amounts absolute; `direction` debit = money out; classify `kind`; normalize merchant (strip card numbers, dates, ref codes); ISO dates; `pending` only for pending/authorization rows; statement metadata incl. opening/closing balance and currency.
- `EXTRACTION_RESPONSE_FORMAT` — `response_format: { type: 'json_schema', json_schema: { name: 'statement', strict: true, schema } }`.
- `parseExtraction(raw: string): ExtractedStatement` — JSON.parse + safe field repair; throws `StatementParseError` if any transaction remains unreadable, so no line silently disappears. The LLM service retries one malformed extraction.
- `normalizeMerchant(desc: string): string`.
- `deriveType(kind, direction): TransactionKind` — purchase/fee → expense; income/refund/interest → income; transfer → transfer (direction decides which leg).
- `buildReviewRows(extraction, categories, accountCurrency): ImportReviewRow[]`:
  - `pending` → flag + `included: false`
  - within-upload duplicate (same date + |amount| + normalizedMerchant) → all but first flagged `duplicate` + excluded
  - `confidence === 'low'` → `lowConfidence` flag ("needs attention")
  - income/expense row with null category → `uncategorized` flag (blocks confirm while included)
  - transfer whose statement and source-account currencies differ → `fxTransfer` flag + excluded; it cannot be re-included in v1
- `reconcileBalance(rows, opening, closing)` → `{ expected, actual, diff, ok }` — `actual` = opening + Σ signed amounts of included non-pending rows; `ok` = |diff| < 0.01. Excluded rows are the usual mismatch cause — banner says so.
- `planImport(rows, accounts, accountId, statementCurrency, makeId): ImportPlan` —
  - expense/income: one row with a client-generated stable ID, positive amount and statement currency
  - same-currency transfer: outgoing and incoming rows with signed amounts, a shared `transferId`, and mutual `correlativeId` values pointing to the other leg's ID
  - rejects an included transfer with an invalid counterpart rather than silently omitting it

### 5. `src/services/llm.ts` (new — side effects only)

- `chatCompletion(settings, messages, opts)` — `fetch` POST to `${aiBaseUrl || 'https://api.openai.com/v1'}/chat/completions`, Bearer auth, `temperature: 0`, AbortController timeout (~90s). Typed errors from status: 401 auth, 429 rate-limit, network/other generic.
- `extractStatement(settings, text, categories, account)` — messages from `lib/statement`, `response_format` json_schema; on a 4xx indicating unsupported `response_format`, retry once with `{ type: 'json_object' }`; result through `parseExtraction`.
- `testAiConnection(settings)` — minimal 1-token chat call returning ok/error message (for the Settings "Test connection" button).

### 6. `src/pages/StatementImport.tsx` (new — route page, default export)

Owns all state (dumb children pattern): `step: 'setup' | 'processing' | 'review' | 'done'`, file, accountId, extraction, review rows + edit callbacks, error.

- setup → "Process" runs: `extractPdfText` → `extractStatement` → `buildReviewRows` → review. Typed errors render triage copy (no text layer / too many pages / password-protected); everything else generic + Retry.
- `beforeunload` warning while processing/review; "Discard" is available before the first commit attempt.
- Confirm: freeze one `planImport` result → one idempotent `bulkAdd` call → best-effort `loadAccounts()` (server trigger keeps balances) → `done`. If the response is lost, review stays locked and Retry resends the same IDs; Discard is hidden because the commit status is uncertain.

### 7. `src/pages/statementimport/` (new — dumb components, relative imports)

- `UploadStep.tsx` — dropzone (.pdf), account Select, inline one-time note "statement text is sent to the AI endpoint configured in Settings", gate card (link to Settings) when no key, error/triage display.
- `ProcessingStep.tsx` — staged progress (Parse PDF → Extract & categorize) with spinner, not one silent spinner.
- `ReviewStep.tsx` — statement header (bank, hint, period, currency-mismatch warning), `BalanceBanner` (jade check / cinnabar diff + hint), merchant-grouped rows sorted flagged-groups-first; per-row: date, description, amount (all editable, `tabular-nums`), type badge, category Select filtered by row type, counterpart Select for transfers (in-session memory of last-used counterpart per merchant), include Checkbox, flags as Badges; group actions: apply category to group, include/exclude group. Footer: "Add n transactions" — disabled while any included row is `uncategorized`, or an included transfer lacks a same-currency counterpart.
- `DoneStep.tsx` — summary (n added, reconciliation result) + link to Transactions.

### 8. Wiring (modify)

- `src/App.tsx` — lazy `StatementImport`, `<Route path="transactions/import">` inside the AuthGuard layout group.
- `src/pages/Transactions.tsx` — "Import Statement" header button (FileText icon) next to "Import CSV" → `navigate('/app/transactions/import')`.
- `src/pages/Settings.tsx` — "AI Extraction" card: API key (password input), Model, Base URL (placeholder `https://api.openai.com/v1`), "Test connection" button with status; saves via `setAiSettings` following the page's existing immediate-save pattern.
- `package.json` — add `pdfjs-dist`.

### 9. Tests (required by AGENTS.md — new store/service/logic coverage)

- `src/test/lib/statement.test.ts` — `deriveType`, `normalizeMerchant`, `buildReviewRows` (pending/duplicate/low-confidence/uncategorized/FX), `reconcileBalance`, `planImport` (pair signs, shared `transferId`, mutual `correlativeId`), `buildExtractionMessages`, `parseExtraction` (valid / invalid JSON / unreadable row).
- `src/test/services/llm.test.ts` — mocked `fetch`: success parse; 401/429 mapping; json_schema → json_object fallback; malformed response.
- `src/test/stores/settings.test.ts` — AI defaults + `setAiSettings` persistence.
- `src/test/pages/statementimport/StatementImport.test.tsx` — gate without key; mocked extraction → review renders groups/flags; linked-transfer batch, lost-response retry, FX pre-exclusion, and triage paths.
- Check `src/test/pages/Transactions.test.tsx` still passes after the header button change.

## Insert mechanics (exact)

1. One `bulkAdd(rows, { idempotent: true })` call sends all plain rows and transfer legs. It uses `ON CONFLICT (id) DO NOTHING`; one Postgres statement is atomic, and retrying the same IDs cannot duplicate rows.
2. Transfer pairs carry a shared `transferId`; each `correlativeId` points to the other leg's ID.
3. Plain rows retain statement currency even when it differs from the selected account (banner warns). FX transfers are pre-excluded. `bulkAdd` computes reporting-currency provenance using the existing store path.
4. Balances update server-side via `maintain_account_balance`; the page refreshes accounts after insert, then displays Done even if that refresh fails.

## Verification

1. `npm test` and `npm run build` (typecheck) and `npm run lint` — all green.
2. Manual E2E (dev server, real key in Settings):
   - Upload a real statement PDF → staged progress → review groups render, balance banner reconciles
   - Batch-fix a merchant's category; edit a row; exclude a pending row; import → verify rows on Transactions, balances correct
   - Transfer row → pick counterpart (different account, same currency) → verify both linked legs appear and both account balances moved
   - Triage: password-protected or scanned PDF → specific error copy; wrong API key → auth error
   - Mid-review reload → unload warning; pre-confirm discard leaves no new rows. After an uncertain response, retry keeps the same IDs and cannot duplicate rows.

## Non-goals (hooks left open)

- Dedup against history: `ImportReviewRow` keeps raw extraction; the pre-excluded-with-override pattern extends to history matches later
- Backfill: flow is per-file; a multi-file loop slots in at the setup step
- FX transfers, PDF retention/audit trail, inline category creation, recurring-transaction interplay — deferred
