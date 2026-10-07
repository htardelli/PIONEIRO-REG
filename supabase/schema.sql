-- Pioneiro-REG · esquema do banco (Supabase / Postgres)
-- Como aplicar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Pode ser executado de novo sem perder dados (idempotente).

-- ============ Perfis ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text,
  color text not null default '#2E75B6',
  annual_goal_min int not null default 36000,   -- 600 h
  min_goal_min int not null default 33600,      -- 560 h (tolerável com justificativa)
  created_at timestamptz not null default now()
);

-- Cria o perfil automaticamente no cadastro
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ Compartilhamento (casal) ============
create table if not exists public.shares (
  owner uuid not null references auth.users(id) on delete cascade,
  viewer uuid not null references auth.users(id) on delete cascade,
  primary key (owner, viewer)
);

create or replace function public.can_read(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target = auth.uid()
      or exists (select 1 from public.shares s where s.owner = target and s.viewer = auth.uid());
$$;

-- Compartilha os MEUS dados (somente leitura) com a conta do e-mail informado.
-- Só o dono dos dados pode conceder o acesso: para os dois se verem, cada um compartilha com o outro.
create or replace function public.link_partner(partner_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  select id into pid from auth.users where lower(email) = lower(trim(partner_email));
  if pid is null then raise exception 'Nenhuma conta com este e-mail. Peça para a pessoa se cadastrar primeiro.'; end if;
  if pid = auth.uid() then raise exception 'Informe o e-mail do cônjuge, não o seu.'; end if;
  insert into public.shares values (auth.uid(), pid) on conflict do nothing;
  return pid;
end $$;

create or replace function public.unlink_partner(partner uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.shares
  where (owner = auth.uid() and viewer = partner) or (owner = partner and viewer = auth.uid());
$$;

-- ============ Dados de serviço ============
create table if not exists public.modalities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#97A3B6',
  active boolean not null default true,
  sort int not null default 0
);

-- Meta, estudos e justificativa por mês ("YYYY-MM")
create table if not exists public.month_records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  goal_min int not null default 3000,
  bible_studies int not null default 0,
  justification text not null default '',
  primary key (user_id, month)
);

-- Planejamento: horas por modalidade em cada dia
create table if not exists public.plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  modality_id uuid not null references public.modalities(id) on delete cascade,
  minutes int not null check (minutes >= 0)
);
create index if not exists plan_items_user_date on public.plan_items (user_id, date);
-- Horário de início/fim de cada atividade planejada (v0.2)
alter table public.plan_items add column if not exists start_time time;
alter table public.plan_items add column if not exists end_time time;
alter table public.plan_items drop constraint if exists plan_items_time_order;
alter table public.plan_items add constraint plan_items_time_order
  check (start_time is null or end_time is null or end_time > start_time);

-- Realizado: horas por modalidade em cada dia
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  modality_id uuid not null references public.modalities(id) on delete cascade,
  minutes int not null check (minutes >= 0)
);
create index if not exists entries_user_date on public.entries (user_id, date);
-- Horário real de início/fim (v0.3)
alter table public.entries add column if not exists start_time time;
alter table public.entries add column if not exists end_time time;
alter table public.entries drop constraint if exists entries_time_order;
alter table public.entries add constraint entries_time_order
  check (start_time is null or end_time is null or end_time > start_time);

-- Observação do dia (ex.: motivo de não cumprir) e marca de "dia lançado"
create table if not exists public.day_notes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  note text not null default '',
  primary key (user_id, date)
);

-- Créditos de horas (não somam no ministério; teto de 55 h/mês com o ministério)
create table if not exists public.credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  type text not null,
  minutes int not null check (minutes >= 0),
  note text not null default ''
);
create index if not exists credits_user_month on public.credits (user_id, month);

-- ============ Segurança (RLS) ============
-- Cada um lê o seu e o do cônjuge; escreve somente o seu.
do $$
declare t text;
begin
  foreach t in array array['modalities','month_records','plan_items','entries','day_notes','credits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists read_own_or_shared on public.%I', t);
    execute format('drop policy if exists write_own on public.%I', t);
    execute format('create policy read_own_or_shared on public.%I for select using (public.can_read(user_id))', t);
    execute format('create policy write_own on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read on public.profiles for select using (public.can_read(id));
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

alter table public.shares enable row level security;
drop policy if exists shares_read on public.shares;
create policy shares_read on public.shares for select using (owner = auth.uid() or viewer = auth.uid());
