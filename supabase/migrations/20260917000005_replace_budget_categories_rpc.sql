-- Audit 08 (issue #12) follow-up, PR #27 review P2: atomic budget association
-- replace. The store previously replaced a budget's budget_categories rows
-- with delete-then-insert across two HTTP requests; a failure after the delete
-- silently wiped the budget's category links and could not roll back. One RPC
-- call = one transaction: both sides commit or roll back together, so prior
-- associations always survive a failed replace.
--
-- Security model (function is security definer, so it bypasses RLS):
-- - budget ownership: explicit guard, with FOR UPDATE so two concurrent
--   replaces on the same budget serialize on the budget row lock (no
--   interleaved delete/insert mixes); different budgets never contend.
-- - category ownership: enforced by the composite FK
--   (category_id, user_id) -> categories(id, user_id) — rows are inserted
--   with the caller's auth.uid(), so a foreign category fails the whole call.
create or replace function public.replace_budget_categories(
  p_budget_id uuid,
  p_category_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Lock the budget row for the transaction's duration; also the ownership
  -- guard (definer bypasses RLS, so the check must be explicit).
  if not exists (
    select 1 from public.budgets
    where id = p_budget_id and user_id = auth.uid()
    for update
  ) then
    raise exception 'budget does not belong to this user';
  end if;

  delete from public.budget_categories
  where budget_id = p_budget_id;

  insert into public.budget_categories (budget_id, category_id, user_id)
  select p_budget_id, cid, auth.uid()
  from unnest(p_category_ids) as cid
  on conflict (budget_id, category_id) do nothing;
end;
$$;

-- User-scoped RPC: no anonymous access (auth.uid() = NULL would fail the guard
-- anyway, but don't advertise it); authenticated gets EXECUTE via Supabase's
-- default privileges, restated explicitly here.
revoke execute on function public.replace_budget_categories(uuid, uuid[])
  from public, anon;
grant execute on function public.replace_budget_categories(uuid, uuid[])
  to authenticated, service_role;
