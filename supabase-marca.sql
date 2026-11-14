-- Propentia — marca de cada cuenta (logo y nombre del asesor)
--
-- Se corre UNA sola vez en Supabase → SQL Editor, DESPUÉS de supabase-aprobacion.sql.
-- Ver CUENTAS-Y-COMPARTIR.md.
--
-- Qué hace: crea la tabla donde cada cuenta guarda su logo y el nombre que sale en
-- "Elaborado por" de sus fichas. Cada persona solo ve y cambia la suya, y solo si su
-- cuenta está aprobada.
--
-- Este script no necesita que cambies nada: se pega completo y se corre.

create table if not exists brand_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  asesor text,
  logo text,
  skipped boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table brand_profiles enable row level security;

do $$
declare
  r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'brand_profiles'
  loop
    execute format('drop policy %I on public.brand_profiles', r.policyname);
  end loop;
end $$;

create policy "own brand_profiles" on brand_profiles
  for all to authenticated
  using (user_id = (select auth.uid()) and (select is_approved()))
  with check (user_id = (select auth.uid()) and (select is_approved()));
