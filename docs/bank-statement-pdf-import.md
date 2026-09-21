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

Extraction chain: `pdfjs-dist` text (lazy-imported, off main bundle) → `lib/statement.ts` builds prompt + JSON schema → `services/llm.ts` chat completion with structured output → `parseExtraction` validates → `buildReviewRows` derives flags → review UI → `rowsToTransactions` → `bulkAdd`.

"Full-screen flow" = dedicated route page inside the standard app shell (sidebar stays, consistent with fixed-sidebar layout rule), reachable from a Transactions header button. Browser back works naturally.

## Key existing code to reuse

- `src/lib/csv.ts` — parsing precedent for `lib` purity and per-row parse helpers
- `src/pages/Transactions.tsx` — transfer-pair mechanics (L260–330): outgoing `amount: -amount`, incoming `+amount` (converted), paired via `correlativeId`
- `src/stores/transactionsStore.ts` `bulkAdd(NewTransaction[])` — sets `baseAmount=amount`, `baseCurrency=currency` automatically
- `src/stores/settingsStore.ts` — localStorage settings pattern to extend
- `src/pages/transactions/CsvImportDialog.tsx` — dumb-component wizard pattern (state lives in page)
- Migration fact: `transactions.correlative_id uuid` has **no FK** (initial_schema.sql L129) → pre-generate `crypto.randomUUID()` for both legs, single `bulkAdd` call

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
  currency: string
  openingBalance: number
  closingBalance: number
  transactions: ExtractedTransaction[]
}
export type ReviewFlag = 'pending' | 'duplicate' | 'lowConfidence' | 'uncategorized'
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

### 3. `src/lib/pdfExtract.ts` (new, pure)

- `extractPdfText(file: File): Promise<{ text: string; pages: number }>` — dynamic `import('pdfjs-dist')` so the lib never touches the main bundle; worker via `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` + `GlobalWorkerOptions.workerSrc`.
- Constants `MAX_PDF_PAGES = 40`, `MAX_STATEMENT_CHARS = 60_000` (truncate text past cap, flag truncation in return value).
- Typed triage errors: `PdfPasswordError`, `PdfNoTextError` (page text empty across all pages), `PdfTooManyPagesError`.

### 4. `src/lib/statement.ts` (new, pure — the core)

- `buildExtractionMessages(text, categories, accountName, accountCurrency): { system, user }` — rules embedded: emit the JSON schema exactly; `categoryId` must be one of the provided `{id, name, type}` list or null (respect category `type`: income cats only for credit rows); amounts absolute; `direction` debit = money out; classify `kind`; normalize merchant (strip card numbers, dates, ref codes); ISO dates; `pending` only for pending/authorization rows; statement metadata incl. opening/closing balance and currency.
- `EXTRACTION_RESPONSE_FORMAT` — `response_format: { type: 'json_schema', json_schema: { name: 'statement', strict: true, schema } }`.
- `parseExtraction(raw: string): ExtractedStatement` — JSON.parse + field-by-field coercion/validation; throws `StatementParseError` with a reason enum (invalid json / missing field / bad types).
- `normalizeMerchant(desc: string): string`.
- `deriveType(kind, direction): TransactionKind` — purchase/fee → expense; income/refund/interest → income; transfer → transfer (direction decides which leg).
- `buildReviewRows(extraction, categories): ImportReviewRow[]`:
  - `pending` → flag + `included: false`
  - within-upload duplicate (same date + |amount| + normalizedMerchant) → all but first flagged `duplicate` + excluded
  - `confidence === 'low'` → `lowConfidence` flag ("needs attention")
  - income/expense row with null category → `uncategorized` flag (blocks confirm while included)
- `reconcileBalance(rows, opening, closing)` → `{ expected, actual, diff, ok }` — `actual` = opening + Σ signed amounts of included non-pending rows; `ok` = |diff| < 0.01. Excluded rows are the usual mismatch cause — banner says so.
- `rowsToTransactions(rows, accounts, accountId, statementCurrency): NewTransaction[]` —
  - expense/income: `{ accountId, type, amount: abs, currency: statementCurrency, date, categoryId, description }`
  - included transfer with same-currency counterpart: two rows sharing `correlativeId = crypto.randomUUID()` — outgoing `{ accountId, amount: -abs }`, incoming `{ accountId: counterpart, amount: +abs }`; skip + keep row flagged if counterpart missing or currency mismatch
  - category null only allowed on transfer rows

### 5. `src/services/llm.ts` (new — side effects only)

- `chatCompletion(settings, messages, opts)` — `fetch` POST to `${aiBaseUrl || 'https://api.openai.com/v1'}/chat/completions`, Bearer auth, `temperature: 0`, AbortController timeout (~90s). Typed errors from status: 401 auth, 429 rate-limit, network/other generic.
- `extractStatement(settings, text, categories, account)` — messages from `lib/statement`, `response_format` json_schema; on a 4xx indicating unsupported `response_format`, retry once with `{ type: 'json_object' }`; result through `parseExtraction`.
- `testAiConnection(settings)` — minimal 1-token chat call returning ok/error message (for the Settings "Test connection" button).

### 6. `src/pages/StatementImport.tsx` (new — route page, default export)

Owns all state (dumb children pattern): `step: 'setup' | 'processing' | 'review' | 'done'`, file, accountId, extraction, review rows + edit callbacks, error.

- setup → "Process" runs: `extractPdfText` → `extractStatement` → `buildReviewRows` → review. Typed errors render triage copy (no text layer / too many pages / password-protected); everything else generic + Retry.
- `beforeunload` warning while processing/review; explicit "Back to Transactions" + "Discard" controls.
- Confirm: `rowsToTransactions` → `bulkAdd` (one call) → `loadAccounts()` (server trigger keeps balances) → `done`. Done step → navigate back to `/app/transactions`.

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

- `src/test/lib/statement.test.ts` — `deriveType`, `normalizeMerchant`, `buildReviewRows` (pending/duplicate/low-confidence/uncategorized), `reconcileBalance`, `rowsToTransactions` (pair signs, shared `correlativeId`, currency, transfer-category nullability), `buildExtractionMessages` (category ids + currency present), `parseExtraction` (valid / invalid JSON / bad fields).
- `src/test/services/llm.test.ts` — mocked `fetch`: success parse; 401/429 mapping; json_schema → json_object fallback; malformed response.
- `src/test/stores/settings.test.ts` — AI defaults + `setAiSettings` persistence.
- `src/test/pages/statementimport/StatementImport.test.tsx` — gate without key; mocked happy path (mock `pdfExtract` + `llm`) → review renders groups/flags → confirm calls `bulkAdd` with expected payloads; triage error path.
- Check `src/test/pages/Transactions.test.tsx` still passes after the header button change.

## Insert mechanics (exact)

1. One `bulkAdd(rows)` call; `bulkAdd` fills `baseAmount`/`baseCurrency`.
2. Transfer pairs: both legs carry a pre-generated shared `correlativeId` — safe because the column has no FK.
3. Row currency = statement currency even when ≠ account currency (banner warns); `bulkAdd` sets baseAmount = amount (same as CSV import — no FX at import, consistent).
4. Balances update server-side via `maintain_account_balance` trigger; page calls `loadAccounts()` after insert.

## Verification

1. `npm test` and `npm run build` (typecheck) and `npm run lint` — all green.
2. Manual E2E (dev server, real key in Settings):
   - Upload a real statement PDF → staged progress → review groups render, balance banner reconciles
   - Batch-fix a merchant's category; edit a row; exclude a pending row; import → verify rows on Transactions, balances correct
   - Transfer row → pick counterpart (different account, same currency) → verify both linked legs appear and both account balances moved
   - Triage: password-protected or scanned PDF → specific error copy; wrong API key → auth error
   - Mid-review reload → unload warning; discard leaves no new rows

## Non-goals (hooks left open)

- Dedup against history: `ImportReviewRow` keeps raw extraction; the pre-excluded-with-override pattern extends to history matches later
- Backfill: flow is per-file; a multi-file loop slots in at the setup step
- FX transfers, PDF retention/audit trail, inline category creation, recurring-transaction interplay — deferred
