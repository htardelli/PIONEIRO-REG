-- Simula o mínimo do Supabase (schema auth, auth.uid(), papéis) para testar schema.sql num Postgres comum.
create schema if not exists auth; create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
create table auth.users (instance_id uuid, id uuid primary key default gen_random_uuid(), aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz, confirmation_token text, recovery_token text,
  email_change_token_new text, email_change text);
create table auth.identities (id uuid primary key, provider_id text not null, user_id uuid references auth.users(id), identity_data jsonb,
  provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;
grant usage on schema auth, extensions to authenticated, anon;
-- conta que já existia antes do schema (fica aprovada pela migração)
insert into auth.users (id, email, raw_user_meta_data) values ('11111111-1111-1111-1111-111111111111', 'h@teste', '{"name":"Herbet"}');
