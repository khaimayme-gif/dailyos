-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run — every statement is idempotent.

create table if not exists categories (
  id text primary key,
  name text not null,
  active boolean not null default true
);

create table if not exists incomes (
  id text primary key,
  person_id text not null,
  type text not null,
  amount numeric not null,
  date date not null,
  account text,
  notes text
);

create table if not exists expenses (
  id text primary key,
  person_id text not null,
  category_id text not null,
  amount numeric not null,
  date date not null,
  payment_method text not null default 'Cash',
  notes text
);

create table if not exists obligations (
  id text primary key,
  name text not null,
  amount numeric not null,
  category_id text not null,
  person_id text not null,
  due_date date not null,
  frequency text not null default 'Monthly',
  active boolean not null default true,
  paid_months text[] not null default '{}'
);

create table if not exists balances (
  id integer primary key default 1,
  cash numeric not null default 0,
  bank numeric not null default 0,
  constraint balances_single_row check (id = 1)
);

create table if not exists visas (
  id text primary key,
  person_id text not null,
  visa_type text not null,
  start_date date not null,
  expiration_date date not null,
  renewal_status text not null default 'Not Started',
  visa_number text,
  institution text,
  notes text,
  checklist jsonb not null default '[]'
);

create table if not exists ninety_day_reports (
  id text primary key,
  person_id text not null,
  last_report_date date not null,
  next_due_date date not null,
  notes text,
  completed boolean not null default false,
  completed_date date,
  created_at timestamptz not null default now()
);

create table if not exists passports (
  id text primary key,
  person_id text not null,
  passport_number text,
  issue_date date not null,
  expiration_date date not null,
  notes text
);

-- Seed default categories (matches the app's built-in list) and a starting balances row.
insert into categories (id, name, active) values
  ('cat_0', 'Allowance for Parents', true),
  ('cat_1', 'Groceries', true),
  ('cat_2', 'Visa Fees', true),
  ('cat_3', 'Car Maintenance', true),
  ('cat_4', 'Rental Bill', true),
  ('cat_5', 'Electricity / Meter Bill', true),
  ('cat_6', 'Water Bill', true),
  ('cat_7', 'Internet', true),
  ('cat_8', 'Transportation', true),
  ('cat_9', 'Dining', true),
  ('cat_10', 'Shopping', true),
  ('cat_11', 'Entertainment', true),
  ('cat_12', 'Healthcare', true),
  ('cat_13', 'Other', true)
on conflict (id) do nothing;

insert into balances (id, cash, bank) values (1, 0, 0)
on conflict (id) do nothing;

-- === Row Level Security ===
-- Anyone with the app's public anon key could otherwise read/write these
-- tables directly. These policies require a signed-in Supabase user for
-- every operation, which is what gates the app behind your login.
alter table categories enable row level security;
alter table incomes enable row level security;
alter table expenses enable row level security;
alter table obligations enable row level security;
alter table balances enable row level security;
alter table visas enable row level security;
alter table ninety_day_reports enable row level security;
alter table passports enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['categories','incomes','expenses','obligations','balances','visas','ninety_day_reports','passports']
  loop
    execute format('drop policy if exists "authenticated_all" on %I;', t);
    execute format(
      'create policy "authenticated_all" on %I for all using (auth.uid() is not null) with check (auth.uid() is not null);',
      t
    );
  end loop;
end $$;
