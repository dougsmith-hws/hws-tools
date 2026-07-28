-- =====================================================================
-- LOCAL VERIFICATION ONLY — never applied to Supabase.
--
-- Supabase provides the `auth` schema, `auth.users`, `auth.uid()` and
-- `auth.role()`. This file recreates just enough of that surface on a
-- plain PostgreSQL instance so the migrations in ../migrations can be
-- executed and the RLS policies genuinely exercised before a Supabase
-- project exists.
--
-- It is NOT part of the deployed schema. On Supabase these objects
-- already exist and this file must not be run.
-- =====================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text unique
);

-- Supabase reads the JWT claims from a request-local GUC. The same
-- mechanism is used here so the policies under test are the real ones.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

-- Supabase's `authenticated` role, so `force row level security` bites.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public, auth to authenticated;
