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

-- ============ Administração (v0.4) ============
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- A primeira conta criada vira administradora, se ainda não houver nenhuma.
update public.profiles set is_admin = true
where id = (select id from auth.users order by created_at limit 1)
  and not exists (select 1 from public.profiles where is_admin);

-- Pelo app, ninguém altera o próprio papel de admin; a troca obrigatória de senha só pode ser desligada (true → false).
create or replace function public.protect_profile_flags() returns trigger
language plpgsql as $$
begin
  -- Só restringe chamadas feitas pelo app (papéis authenticated/anon); funções internas e migrações passam.
  if current_user in ('authenticated', 'anon') then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'Não é permitido alterar o papel de administrador.';
    end if;
    if new.must_change_password and not old.must_change_password then
      raise exception 'Operação não permitida.';
    end if;
    if new.approved is distinct from old.approved then
      raise exception 'Somente o administrador aprova cadastros.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_flags on public.profiles;
create trigger protect_profile_flags before update on public.profiles
  for each row execute function public.protect_profile_flags();

-- Admin cria uma conta com senha provisória (troca obrigatória no primeiro acesso).
-- share_mine: o admin já compartilha os PRÓPRIOS dados com a nova conta (o inverso fica a critério da nova pessoa).
create or replace function public.admin_create_user(p_email text, p_name text, p_password text, share_mine boolean default true)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := gen_random_uuid();
  em text := lower(trim(p_email));
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Somente administradores podem criar contas.';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'A senha provisória precisa ter pelo menos 8 caracteres.'; end if;
  if exists (select 1 from auth.users where lower(email) = em) then raise exception 'Já existe uma conta com este e-mail.'; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', coalesce(nullif(trim(p_name), ''), split_part(em, '@', 1))),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid::text, uid,
          jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true),
          'email', now(), now(), now());

  -- o perfil é criado pelo gatilho handle_new_user; marca a troca obrigatória
  update public.profiles set must_change_password = true, approved = true where id = uid; -- criada pelo admin: já aprovada

  if share_mine then
    insert into public.shares values (auth.uid(), uid) on conflict do nothing;
  end if;
  return uid;
end $$;

revoke all on function public.admin_create_user(text, text, text, boolean) from public, anon;
grant execute on function public.admin_create_user(text, text, text, boolean) to authenticated;

-- ============ Atividades conjuntas (v0.5) ============
-- group_id liga a mesma atividade nos planos/lançamentos de participantes diferentes.
alter table public.plan_items add column if not exists group_id uuid;
alter table public.entries add column if not exists group_id uuid;
create index if not exists plan_items_group on public.plan_items (group_id) where group_id is not null;
create index if not exists entries_group on public.entries (group_id) where group_id is not null;

-- Compartilhamento mútuo (os dois liberaram os próprios dados um para o outro)
create or replace function public.is_mutual(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shares where owner = a and viewer = b)
     and exists (select 1 from public.shares where owner = b and viewer = a);
$$;

-- Modalidade do participante com o mesmo nome (as modalidades são de cada usuário)
create or replace function public.partner_modality(p_partner uuid, p_name text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare mid uuid; pname text;
begin
  if not public.is_mutual(auth.uid(), p_partner) then raise exception 'Sem permissão.'; end if;
  select id into mid from public.modalities
   where user_id = p_partner and lower(trim(name)) = lower(trim(p_name))
   order by active desc limit 1;
  if mid is null then
    select name into pname from public.profiles where id = p_partner;
    raise exception '% não tem a modalidade "%". Peça para criar em Configurações.', coalesce(pname, 'O participante'), p_name;
  end if;
  return mid;
end $$;

-- Validação comum das listas enviadas ao participante (v0.12): tamanho, atividade conjunta e janela de datas
create or replace function public.check_partner_items(p_items jsonb, p_max_future int default 400) returns void
language plpgsql stable set search_path = public as $$
declare it jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 1000 then
    raise exception 'Lista inválida (máx. 1000 itens).';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if nullif(it->>'group_id', '') is null then raise exception 'Somente atividades conjuntas podem ser gravadas para o participante.'; end if;
    if (it->>'date')::date not between current_date - 400 and current_date + p_max_future then raise exception 'Data fora do período permitido.'; end if;
  end loop;
end $$;

-- Grava (ou substitui) atividades conjuntas no PLANO do participante.
-- p_items: [{date, group_id, modality, start, end}] — bloqueia se houver conflito de horário.
create or replace function public.partner_plan_upsert(p_partner uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb; d date; g uuid; s time; e time; mid uuid; pname text; c record;
begin
  if not public.is_mutual(auth.uid(), p_partner) then
    raise exception 'Para planejar juntos, os dois precisam ter compartilhado um com o outro na aba Casal.';
  end if;
  perform public.check_partner_items(p_items);
  select name into pname from public.profiles where id = p_partner;
  for it in select * from jsonb_array_elements(p_items) loop
    d := (it->>'date')::date; g := (it->>'group_id')::uuid; s := (it->>'start')::time; e := (it->>'end')::time;
    mid := public.partner_modality(p_partner, it->>'modality');
    delete from public.plan_items where user_id = p_partner and date = d and group_id = g;
    select p.start_time, p.end_time, m.name into c
      from public.plan_items p left join public.modalities m on m.id = p.modality_id
     where p.user_id = p_partner and p.date = d and p.start_time < e and p.end_time > s limit 1;
    if found then
      raise exception 'Conflito no plano de % em %: % %–%.', coalesce(pname, 'participante'), to_char(d, 'DD/MM'),
        coalesce(c.name, 'atividade'), to_char(c.start_time, 'HH24:MI'), to_char(c.end_time, 'HH24:MI');
    end if;
    insert into public.plan_items (user_id, date, modality_id, minutes, start_time, end_time, group_id)
    values (p_partner, d, mid, (extract(epoch from (e - s)) / 60)::int, s, e, g);
  end loop;
end $$;

-- Remove atividades conjuntas do PLANO do participante (grupos informados, no intervalo de datas)
create or replace function public.partner_plan_delete(p_partner uuid, p_groups uuid[], p_from date, p_to date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_mutual(auth.uid(), p_partner) then
    raise exception 'Para alterar o plano do participante, os dois precisam ter compartilhado um com o outro.';
  end if;
  delete from public.plan_items
   where user_id = p_partner and group_id = any(p_groups) and date between p_from and p_to;
end $$;

-- Lança o REALIZADO de atividades conjuntas para o participante (quem lança primeiro confirma a participação).
-- Não sobrescreve: se o participante já lançou aquela atividade no dia, ela é ignorada.
create or replace function public.partner_entries_add(p_partner uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; d date; g uuid; s time; e time; mid uuid; pname text; c record; n int := 0;
begin
  if not public.is_mutual(auth.uid(), p_partner) then
    raise exception 'Para lançar juntos, os dois precisam ter compartilhado um com o outro na aba Casal.';
  end if;
  perform public.check_partner_items(p_items, 1); -- realizado: no máximo até amanhã (fuso)
  select name into pname from public.profiles where id = p_partner;
  for it in select * from jsonb_array_elements(p_items) loop
    d := (it->>'date')::date; g := (it->>'group_id')::uuid; s := (it->>'start')::time; e := (it->>'end')::time;
    continue when exists (select 1 from public.entries where user_id = p_partner and date = d and group_id = g);
    mid := public.partner_modality(p_partner, it->>'modality');
    select en.start_time, en.end_time, m.name into c
      from public.entries en left join public.modalities m on m.id = en.modality_id
     where en.user_id = p_partner and en.date = d and en.start_time < e and en.end_time > s limit 1;
    if found then
      raise exception 'Conflito no lançamento de % em %: % %–%.', coalesce(pname, 'participante'), to_char(d, 'DD/MM'),
        coalesce(c.name, 'atividade'), to_char(c.start_time, 'HH24:MI'), to_char(c.end_time, 'HH24:MI');
    end if;
    insert into public.entries (user_id, date, modality_id, minutes, start_time, end_time, group_id)
    values (p_partner, d, mid, (extract(epoch from (e - s)) / 60)::int, s, e, g);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.partner_plan_upsert(uuid, jsonb) from public, anon;
revoke all on function public.partner_plan_delete(uuid, uuid[], date, date) from public, anon;
revoke all on function public.partner_entries_add(uuid, jsonb) from public, anon;
grant execute on function public.partner_plan_upsert(uuid, jsonb) to authenticated;
grant execute on function public.partner_plan_delete(uuid, uuid[], date, date) to authenticated;
grant execute on function public.partner_entries_add(uuid, jsonb) to authenticated;

-- ============ v0.6: meta do mês opcional ============
-- 0 = mês sem meta (o alvo vira o rateio). Antes o padrão era 50 h.
alter table public.month_records alter column goal_min set default 0;

-- ============ v0.7: falta em atividade conjunta ============
-- Lança a falta do participante no dia (nota "Faltei…"), só se ele(a) ainda não lançou nada nesse dia.
create or replace function public.partner_absence_add(p_partner uuid, p_date date, p_note text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_mutual(auth.uid(), p_partner) then
    raise exception 'Para lançar juntos, os dois precisam ter compartilhado um com o outro na aba Casal.';
  end if;
  if exists (select 1 from public.entries where user_id = p_partner and date = p_date)
     or exists (select 1 from public.day_notes where user_id = p_partner and date = p_date) then
    return false; -- já lançou algo nesse dia: não sobrescreve
  end if;
  insert into public.day_notes (user_id, date, note) values (p_partner, p_date, coalesce(p_note, 'Faltei'));
  return true;
end $$;

revoke all on function public.partner_absence_add(uuid, date, text) from public, anon;
grant execute on function public.partner_absence_add(uuid, date, text) to authenticated;

-- ============ v0.8: falta por atividade (não pelo dia inteiro) ============
-- Um lançamento "absent" registra que a atividade (conjunta) não foi feita: 0 min, com o motivo em note.
alter table public.entries add column if not exists absent boolean not null default false;
alter table public.entries add column if not exists note text not null default '';

drop function if exists public.partner_absence_add(uuid, date, text);
-- Lança a falta do participante SÓ nas atividades conjuntas informadas (p_groups) daquele dia.
-- Ignora as atividades que ele(a) já lançou; não toca nas demais atividades do dia.
create or replace function public.partner_absence_add(p_partner uuid, p_date date, p_groups uuid[], p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_mutual(auth.uid(), p_partner) then
    raise exception 'Para lançar juntos, os dois precisam ter compartilhado um com o outro na aba Casal.';
  end if;
  insert into public.entries (user_id, date, modality_id, minutes, start_time, end_time, group_id, absent, note)
  select p.user_id, p.date, p.modality_id, 0, p.start_time, p.end_time, p.group_id, true, left(coalesce(p_note, 'Faltei'), 300)
    from public.plan_items p
   where p.user_id = p_partner and p.date = p_date and p.group_id = any(p_groups)
     and not exists (select 1 from public.entries e where e.user_id = p_partner and e.date = p_date and e.group_id = p.group_id);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.partner_absence_add(uuid, date, uuid[], text) from public, anon;
grant execute on function public.partner_absence_add(uuid, date, uuid[], text) to authenticated;

-- ============ v0.9: eventos do dia (congresso, assembleia…) ============
-- Explica por que um dia não tem plano. group_id liga o mesmo evento no casal.
create table if not exists public.day_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  kind text not null,
  title text not null default '',
  group_id uuid
);
create index if not exists day_events_user_date on public.day_events (user_id, date);
grant select, insert, update, delete on public.day_events to authenticated;
alter table public.day_events enable row level security;
drop policy if exists read_own_or_shared on public.day_events;
drop policy if exists write_own on public.day_events;
create policy read_own_or_shared on public.day_events for select using (public.can_read(user_id));
create policy write_own on public.day_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Grava o evento também para o cônjuge (substitui o mesmo grupo no mesmo dia)
create or replace function public.partner_events_add(p_partner uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if not public.is_mutual(auth.uid(), p_partner) then
    raise exception 'Para marcar eventos juntos, os dois precisam ter compartilhado um com o outro na aba Casal.';
  end if;
  perform public.check_partner_items(p_items);
  for it in select * from jsonb_array_elements(p_items) loop
    delete from public.day_events where user_id = p_partner and date = (it->>'date')::date and group_id = (it->>'group_id')::uuid;
    insert into public.day_events (user_id, date, kind, title, group_id)
    values (p_partner, (it->>'date')::date, left(it->>'kind', 60), left(coalesce(it->>'title', ''), 120), (it->>'group_id')::uuid);
  end loop;
end $$;

create or replace function public.partner_events_delete(p_partner uuid, p_groups uuid[], p_dates date[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_mutual(auth.uid(), p_partner) then
    raise exception 'Para alterar eventos do participante, os dois precisam ter compartilhado um com o outro.';
  end if;
  delete from public.day_events where user_id = p_partner and group_id = any(p_groups) and date = any(p_dates);
end $$;

-- Remove atividades conjuntas do plano do participante só nas datas informadas (seleção de vários dias)
create or replace function public.partner_plan_delete_dates(p_partner uuid, p_groups uuid[], p_dates date[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_mutual(auth.uid(), p_partner) then
    raise exception 'Para alterar o plano do participante, os dois precisam ter compartilhado um com o outro.';
  end if;
  delete from public.plan_items where user_id = p_partner and group_id = any(p_groups) and date = any(p_dates);
end $$;

revoke all on function public.partner_events_add(uuid, jsonb) from public, anon;
revoke all on function public.partner_events_delete(uuid, uuid[], date[]) from public, anon;
revoke all on function public.partner_plan_delete_dates(uuid, uuid[], date[]) from public, anon;
grant execute on function public.partner_events_add(uuid, jsonb) to authenticated;
grant execute on function public.partner_events_delete(uuid, uuid[], date[]) to authenticated;
grant execute on function public.partner_plan_delete_dates(uuid, uuid[], date[]) to authenticated;

-- ============ v0.10: tipos de evento (cadastro em Configurações) ============
create table if not exists public.event_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  sort int not null default 0
);
create index if not exists event_types_user on public.event_types (user_id);
grant select, insert, update, delete on public.event_types to authenticated;
alter table public.event_types enable row level security;
drop policy if exists read_own_or_shared on public.event_types;
drop policy if exists write_own on public.event_types;
create policy read_own_or_shared on public.event_types for select using (public.can_read(user_id));
create policy write_own on public.event_types for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ v0.11: foto de perfil ============
-- Imagem pequena (JPEG 256×256 em data URL) gerada no próprio app.
alter table public.profiles add column if not exists avatar text;

-- ============ v0.12: endurecimento de segurança ============
-- Funções auxiliares fora do alcance do papel anônimo; as internas, só para o próprio banco
revoke all on function public.can_read(uuid) from public, anon;
grant execute on function public.can_read(uuid) to authenticated;
revoke all on function public.link_partner(text) from public, anon;
grant execute on function public.link_partner(text) to authenticated;
revoke all on function public.unlink_partner(uuid) from public, anon;
grant execute on function public.unlink_partner(uuid) to authenticated;
revoke all on function public.is_mutual(uuid, uuid) from public, anon, authenticated;
revoke all on function public.partner_modality(uuid, text) from public, anon, authenticated;
revoke all on function public.check_partner_items(jsonb, int) from public, anon, authenticated;

-- Cores só em hexadecimal e foto só como JPEG pequeno em data URL (impede imagem/estilo externo e abuso de espaço).
-- "not valid": vale para gravações novas sem travar dados antigos.
alter table public.profiles drop constraint if exists profiles_color_hex;
alter table public.profiles add constraint profiles_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$') not valid;
alter table public.modalities drop constraint if exists modalities_color_hex;
alter table public.modalities add constraint modalities_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$') not valid;
alter table public.profiles drop constraint if exists profiles_avatar_ok;
alter table public.profiles add constraint profiles_avatar_ok
  check (avatar is null or (avatar ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' and length(avatar) <= 150000)) not valid;
-- Textos livres com tamanho máximo
alter table public.profiles drop constraint if exists profiles_name_len;
alter table public.profiles add constraint profiles_name_len check (length(name) <= 80) not valid;
alter table public.month_records drop constraint if exists month_records_just_len;
alter table public.month_records add constraint month_records_just_len check (length(justification) <= 2000) not valid;
alter table public.day_notes drop constraint if exists day_notes_note_len;
alter table public.day_notes add constraint day_notes_note_len check (length(note) <= 500) not valid;
alter table public.day_events drop constraint if exists day_events_len;
alter table public.day_events add constraint day_events_len check (length(kind) <= 60 and length(title) <= 120) not valid;

-- ============ v0.13: cadastro com aprovação do administrador ============
-- Contas já existentes ficam aprovadas (default true só nesta criação da coluna); novas nascem pendentes.
alter table public.profiles add column if not exists approved boolean not null default true;
alter table public.profiles alter column approved set default false;
update public.profiles set approved = true where is_admin and not approved;

-- Quem chama está aprovado?
create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select approved from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.is_approved() from public, anon;
grant execute on function public.is_approved() to authenticated;

-- Conta pendente não lê nem grava nada (só o próprio perfil, para ver o aviso "aguardando aprovação")
do $$
declare t text;
begin
  foreach t in array array['modalities','month_records','plan_items','entries','day_notes','credits','day_events','event_types'] loop
    execute format('drop policy if exists read_own_or_shared on public.%I', t);
    execute format('drop policy if exists write_own on public.%I', t);
    execute format('create policy read_own_or_shared on public.%I for select using (public.is_approved() and public.can_read(user_id))', t);
    execute format('create policy write_own on public.%I for all using (user_id = auth.uid() and public.is_approved()) with check (user_id = auth.uid() and public.is_approved())', t);
  end loop;
end $$;

-- Compartilhar e escrever no cônjuge também exigem conta aprovada (os dois lados)
create or replace function public.is_mutual(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shares where owner = a and viewer = b)
     and exists (select 1 from public.shares where owner = b and viewer = a)
     and (select count(*) from public.profiles where id in (a, b) and approved) = 2;
$$;
revoke all on function public.is_mutual(uuid, uuid) from public, anon, authenticated;

create or replace function public.link_partner(partner_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null or not public.is_approved() then raise exception 'Conta aguardando aprovação.'; end if;
  select id into pid from auth.users where lower(email) = lower(trim(partner_email));
  if pid is null then raise exception 'Nenhuma conta com este e-mail. Peça para a pessoa se cadastrar primeiro.'; end if;
  if pid = auth.uid() then raise exception 'Informe o e-mail do cônjuge, não o seu.'; end if;
  insert into public.shares values (auth.uid(), pid) on conflict do nothing;
  return pid;
end $$;
revoke all on function public.link_partner(text) from public, anon;
grant execute on function public.link_partner(text) to authenticated;

-- Administração dos cadastros pendentes
create or replace function public.admin_pending_users() returns table (id uuid, name text, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Somente administradores.';
  end if;
  return query select p.id, p.name, p.email, p.created_at from public.profiles p where not p.approved order by p.created_at;
end $$;

create or replace function public.admin_set_approval(p_user uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Somente administradores.';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user and (p.approved or p.is_admin)) then
    raise exception 'Esta conta já está aprovada.';
  end if;
  if p_approve then
    update public.profiles set approved = true where id = p_user;
  else
    delete from auth.users where id = p_user; -- recusado: remove a conta (perfil e dados saem em cascata)
  end if;
end $$;

revoke all on function public.admin_pending_users() from public, anon;
revoke all on function public.admin_set_approval(uuid, boolean) from public, anon;
grant execute on function public.admin_pending_users() to authenticated;
grant execute on function public.admin_set_approval(uuid, boolean) to authenticated;
