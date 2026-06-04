create extension if not exists "pgcrypto";

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  role text not null,
  email text,
  status text not null default 'Ativo',
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text,
  phone text,
  owner text,
  status text not null default 'Ativo',
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_id uuid references public.clients(id) on delete cascade,
  people_ids uuid[] not null default '{}',
  category text,
  priority text not null default 'Media',
  due_date date,
  status text not null default 'Pendente',
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_assignments (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  client_id uuid references public.clients(id) on delete cascade,
  people_ids uuid[] not null default '{}',
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  person_id uuid references public.team_members(id) on delete set null,
  period text not null,
  amount numeric(12,2) not null default 0,
  status text not null default 'Pendente',
  created_at timestamptz not null default now()
);

create table if not exists public.vacations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.team_members(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'Programada',
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.home_office_days (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.team_members(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  work_date date not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  name text not null,
  type text not null,
  link text,
  created_at timestamptz not null default now()
);

alter table public.team_members enable row level security;
alter table public.clients enable row level security;
alter table public.tasks enable row level security;
alter table public.monthly_assignments enable row level security;
alter table public.reimbursements enable row level security;
alter table public.vacations enable row level security;
alter table public.home_office_days enable row level security;
alter table public.documents enable row level security;

drop policy if exists team_members_authenticated_access on public.team_members;
drop policy if exists clients_authenticated_access on public.clients;
drop policy if exists tasks_authenticated_access on public.tasks;
drop policy if exists monthly_assignments_authenticated_access on public.monthly_assignments;
drop policy if exists reimbursements_authenticated_access on public.reimbursements;
drop policy if exists vacations_authenticated_access on public.vacations;
drop policy if exists home_office_days_authenticated_access on public.home_office_days;
drop policy if exists documents_authenticated_access on public.documents;

create policy team_members_authenticated_access on public.team_members for all to authenticated using (true) with check (true);
create policy clients_authenticated_access on public.clients for all to authenticated using (true) with check (true);
create policy tasks_authenticated_access on public.tasks for all to authenticated using (true) with check (true);
create policy monthly_assignments_authenticated_access on public.monthly_assignments for all to authenticated using (true) with check (true);
create policy reimbursements_authenticated_access on public.reimbursements for all to authenticated using (true) with check (true);
create policy vacations_authenticated_access on public.vacations for all to authenticated using (true) with check (true);
create policy home_office_days_authenticated_access on public.home_office_days for all to authenticated using (true) with check (true);
create policy documents_authenticated_access on public.documents for all to authenticated using (true) with check (true);
