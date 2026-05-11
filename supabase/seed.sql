-- Create a test user: test@example.com / password123
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
  email_change, phone, phone_change, phone_change_token, reauthentication_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'test@example.com',
  crypt('password123', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}', false,
  '', '', '', '',
  '', '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-000000000001', 'test@example.com')::jsonb,
  'email',
  '00000000-0000-0000-0000-000000000001',
  now(), now(), now()
)
on conflict do nothing;

-- Set up the context so the set_user_id() trigger correctly sees our test user's UUID
begin;
set local "request.jwt.claims" to '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

-- Create some categories
insert into public.categories (id, name, type, color, icon)
values
  ('11111111-1111-1111-1111-111111111111', 'Salary', 'income', '#10b981', 'briefcase'),
  ('22222222-2222-2222-2222-222222222222', 'Groceries', 'expense', '#ef4444', 'shopping-cart'),
  ('33333333-3333-3333-3333-333333333333', 'Entertainment', 'expense', '#f59e0b', 'film')
on conflict do nothing;

-- Create an account
insert into public.accounts (id, name, type, currency, balance)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Main Checking', 'checking', 'USD', 0)
on conflict do nothing;

-- Create some transactions
-- Note: the maintain_account_balance trigger will update the account balance automatically
insert into public.transactions (id, account_id, category_id, type, amount, currency, base_amount, base_currency, date, description)
values
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'income', 5000.00, 'USD', 5000.00, 'USD', current_date - interval '5 days', 'Monthly Salary'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'expense', 150.50, 'USD', 150.50, 'USD', current_date - interval '2 days', 'Whole Foods'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'expense', 45.00, 'USD', 45.00, 'USD', current_date - interval '1 day', 'Movie Tickets')
on conflict do nothing;

-- Create some budgets
insert into public.budgets (id, name, amount, period, start_date, category_ids)
values
  (gen_random_uuid(), 'Monthly Groceries', 500.00, 'monthly', date_trunc('month', current_date)::date, '{22222222-2222-2222-2222-222222222222}'),
  (gen_random_uuid(), 'Entertainment', 100.00, 'monthly', date_trunc('month', current_date)::date, '{33333333-3333-3333-3333-333333333333}')
on conflict do nothing;

commit;
