# Seed recipes (verified against `supabase/migrations/`)

Seed DB state through `userSupabase` from the `test` fixture — a PostgREST
client signed in as the test user. The `set_user_id` trigger fills `user_id`
from `auth.uid()`; never pass `user_id` and never seed through the
service-role client (it cannot satisfy the ownership triggers).

All amounts: `numeric`, at most 2 decimal places, finite. Currencies must
match `^[A-Z]{3}$`.

## accounts

```ts
const {
  data: [acct],
} = await userSupabase
  .from('accounts')
  .insert({ name: 'Seed Checking', type: 'checking', currency: 'USD', opening_balance: 1000 })
  .select()
```

- `type` ∈ `checking | savings | investment | credit | cash`.
- **Do NOT write `balance`** — it is a derived cache maintained by the
  `enforce_account_balance` trigger. Seed the starting value via
  `opening_balance`; the trigger computes `balance` as opening balance ± the
  account's transactions.

## categories

```ts
const {
  data: [cat],
} = await userSupabase
  .from('categories')
  .insert({ name: 'Rent', type: 'expense', color: '#888888' })
  .select()
```

- `type` ∈ `income | expense`. `color` is NOT NULL (any hex string works).
- `parent_id` optional (parent-child hierarchy).

## transactions

```ts
const {
  data: [tx],
} = await userSupabase
  .from('transactions')
  .insert({
    account_id: acct.id,
    category_id: cat.id, // nullable — omit for category-less rows
    type: 'expense', // income | expense | transfer
    amount: 40,
    currency: 'USD', // must match the account's currency (composite FK)
    base_amount: 40, // = amount when currency == base currency
    base_currency: 'USD',
    date: '2024-02-15',
    description: 'Whole Foods',
  })
  .select()
```

- NOT NULLs that surprise cold drivers: `type`, `currency`, `base_amount`,
  `base_currency`, `date`.
- `amount > 0` for income/expense; `transfer` may be negative but not 0;
  at most 2 decimal places.
- Composite FK `(account_id, currency)` → `accounts(id, currency)`: the
  transaction currency must equal the account currency.
- The `maintain_account_balance` trigger updates `accounts.balance` on every
  insert/update/delete — read the balance back as side-effect proof.
- For pagination recipes seed ≥105 rows (50 → 100 → 105 exercises every
  count line).

## budgets

```ts
const {
  data: [budget],
} = await userSupabase
  .from('budgets')
  .insert({
    name: 'Monthly Food',
    amount: 400,
    period: 'monthly', // monthly | yearly
    start_date: '2026-09-01',
  })
  .select()
// categories link through the budget_categories table via the RPC —
// budgets has NO category_ids column (dropped in migration 20260917000004).
await userSupabase.rpc('replace_budget_categories', {
  p_budget_id: budget.id,
  p_category_ids: [cat.id],
})
```

- `budgets` columns: `name`, `amount` (finite, > 0), `period` (`monthly |
yearly`), `start_date`.
- Budget↔category links live in `budget_categories (budget_id, category_id,
user_id)`, written by the `replace_budget_categories(p_budget_id,
p_category_ids)` RPC (it validates ownership). Read links back with
  `userSupabase.from('budget_categories').select().eq('budget_id', budget.id)`.
- The UI requires at least one category per budget.

## users

Never create users directly — `createTestUser()` from `e2e/fixtures.ts`
provisions a confirmed user with a unique email and deletes it (with all rows,
via FK cascade) when the test ends. For UI-created signups clean up with
`deleteUserByEmail()`.
