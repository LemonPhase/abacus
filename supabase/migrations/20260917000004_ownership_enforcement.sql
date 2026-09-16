-- Audit 08 (issue #12): enforce same-user ownership across all database relationships.
--
-- RLS protects row ownership, but PostgreSQL foreign-key checks bypass RLS: a
-- single-column FK like transactions.account_id -> accounts(id) happily points
-- at another user's row when the attacker knows the foreign UUID. That enables
-- cross-user references and lets the reference block the owner's deletes.
--
-- Fix: every cross-table relationship becomes a composite FK on
-- (referenced_id, user_id) targeting a UNIQUE (id, user_id) pair on the parent
-- table, so a reference is only satisfiable when the parent row belongs to the
-- same user. Nullable composite FKs follow MATCH SIMPLE semantics: if the
-- nullable column is NULL, the constraint passes.
--
--   accounts(id, user_id)          <- transactions(account_id, user_id)
--                                    recurring_transactions(account_id, user_id)
--   categories(id, user_id)        <- transactions(category_id, user_id)
--                                    recurring_transactions(category_id, user_id)
--                                    categories(parent_id, user_id)
--   budgets(id, user_id)           <- budget_categories(budget_id, user_id)  [new]
--   auth.users(id)                 <- budget_categories.user_id (cascade)
--
-- The unvalidated budgets.category_ids uuid[] array (impossible to constrain)
-- is replaced by the budget_categories association table.
--
-- Remediation (before any constraint is enabled — idempotent, preserves data):
-- - transactions / recurring_transactions whose account belongs to another
--   user are reassigned to the account's owner. The row's data is preserved
--   and the ledger stays consistent: account_id is unchanged, so signed
--   effects (and therefore balances) are unaffected. These rows are the
--   residue of the very bug this fixes (or pre-20260511182423 inserts); after
--   reassignment the reference is legitimate. The balance-maintenance trigger
--   is disabled around the reassignment: it validates the OLD user_id and
--   would reject the write, while the balance arithmetic itself is a no-op
--   here (account_id does not change).
-- - Nullable references (transactions/recurring category_id, categories
--   parent_id) pointing at another user's (or a dangling) row are set to NULL;
--   the referencing row is kept with its other data intact.
-- - budgets.category_ids entries that are not same-user existing categories
--   (foreign or dangling UUIDs) are dropped during the array -> association
--   conversion; valid entries are preserved.

-- ============================================================================
-- 1. Remediation: repair invalid cross-user / dangling references.
-- ============================================================================

-- Reassign transactions that reference a foreign account to the account's
-- owner (preserves the row; balances are unaffected — see header).
alter table transactions disable trigger user;
update transactions t
set user_id = a.user_id
from accounts a
where t.account_id = a.id
  and t.user_id is distinct from a.user_id;
alter table transactions enable trigger user;

-- Same for recurring templates (no balance trigger to bypass there).
update recurring_transactions r
set user_id = a.user_id
from accounts a
where r.account_id = a.id
  and r.user_id is distinct from a.user_id;

-- NULL out category references that don't belong to the (possibly reassigned)
-- row's user, or dangle (covers both — `not exists` is deliberate).
update transactions t
set category_id = null
where t.category_id is not null
  and not exists (
    select 1 from categories c
    where c.id = t.category_id and c.user_id = t.user_id
  );

update recurring_transactions r
set category_id = null
where r.category_id is not null
  and not exists (
    select 1 from categories c
    where c.id = r.category_id and c.user_id = r.user_id
  );

-- NULL out category parents that don't belong to the same user, or dangle.
update categories k
set parent_id = null
where k.parent_id is not null
  and not exists (
    select 1 from categories p
    where p.id = k.parent_id and p.user_id = k.user_id
  );

-- ============================================================================
-- 2. Unique (id, user_id) pairs — the composite FK targets.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_id_user_id_key') then
    alter table accounts add constraint accounts_id_user_id_key unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'categories_id_user_id_key') then
    alter table categories add constraint categories_id_user_id_key unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'budgets_id_user_id_key') then
    alter table budgets add constraint budgets_id_user_id_key unique (id, user_id);
  end if;
end $$;

-- ============================================================================
-- 3. Swap single-column FKs for same-user composite FKs.
--    The old FKs are dropped by catalog lookup (name-agnostic): every FK on
--    transactions / recurring_transactions / categories whose target is
--    accounts or categories. FKs to auth.users are kept untouched.
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select conrelid::regclass::text as tbl, conname
    from pg_constraint
    where contype = 'f'
      and conrelid in ('transactions'::regclass, 'recurring_transactions'::regclass, 'categories'::regclass)
      and confrelid in ('accounts'::regclass, 'categories'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_account_same_user_fkey') then
    alter table transactions add constraint transactions_account_same_user_fkey
      foreign key (account_id, user_id) references accounts (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_category_same_user_fkey') then
    alter table transactions add constraint transactions_category_same_user_fkey
      foreign key (category_id, user_id) references categories (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'categories_parent_same_user_fkey') then
    alter table categories add constraint categories_parent_same_user_fkey
      foreign key (parent_id, user_id) references categories (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurring_transactions_account_same_user_fkey') then
    alter table recurring_transactions add constraint recurring_transactions_account_same_user_fkey
      foreign key (account_id, user_id) references accounts (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurring_transactions_category_same_user_fkey') then
    alter table recurring_transactions add constraint recurring_transactions_category_same_user_fkey
      foreign key (category_id, user_id) references categories (id, user_id);
  end if;
end $$;

-- ============================================================================
-- 4. budget_categories: constrained replacement for budgets.category_ids.
-- ============================================================================

create table if not exists budget_categories (
  budget_id uuid not null,
  category_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (budget_id, category_id),
  foreign key (budget_id, user_id) references budgets (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references categories (id, user_id) on delete cascade
);

comment on table budget_categories is
  'Audit 08: same-user budget -> category associations. Replaces the '
  'unconstrained budgets.category_ids array; composite FKs make cross-user '
  'references unsatisfiable.';

create index if not exists idx_budget_categories_category_id
  on budget_categories(category_id);

alter table budget_categories enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where policyname = 'Users can manage their own budget_categories'
                   and tablename = 'budget_categories') then
    execute 'create policy "Users can manage their own budget_categories"
             on budget_categories for all using (auth.uid() = user_id)';
  end if;
end $$;

-- ============================================================================
-- 5. Convert existing budget -> category arrays to association rows.
--    Only same-user existing categories migrate; foreign/dangling entries are
--    dropped (remediation). Idempotent via the column guard + on conflict.
-- ============================================================================

-- Guard for re-runs against a database where an earlier pass created the
-- trigger before this point (see note at the end of this migration).
drop trigger if exists set_user_id on budget_categories;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'budgets' and column_name = 'category_ids'
  ) then
    insert into budget_categories (budget_id, category_id, user_id)
    select b.id, c.id, b.user_id
    from budgets b
    join categories c on c.user_id = b.user_id and c.id = any (b.category_ids)
    on conflict (budget_id, category_id) do nothing;

    alter table budgets drop column category_ids;
  end if;
end $$;

-- The set_user_id trigger is created only after the conversion above: it would
-- overwrite the migrated user_id with auth.uid(), which is NULL outside a
-- request context (the conversion supplies the correct user_id explicitly).
drop trigger if exists set_user_id on budget_categories;
create trigger set_user_id before insert on budget_categories
  for each row execute function set_user_id();
