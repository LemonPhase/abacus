-- Add sort_order column to categories for manual reordering
-- Rows without sort_order default to 0; existing rows are backfilled sequentially.

alter table categories add column if not exists sort_order integer not null default 0;

-- Backfill existing rows with sequential sort_order per user
do $$
declare
  r record;
  pos integer;
begin
  for r in select distinct user_id from categories loop
    pos := 0;
    for r in select id from categories where user_id = r.user_id order by created_at loop
      update categories set sort_order = pos where id = r.id;
      pos := pos + 1;
    end loop;
  end loop;
end $$;
