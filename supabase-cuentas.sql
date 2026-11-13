-- propentia — cuentas por usuario + biblioteca privada con compartir por correo
--
-- Se corre UNA sola vez en Supabase → SQL Editor, DESPUÉS de crear tu propia cuenta
-- desde la app (pantalla "Crear cuenta"). Ver CUENTAS-Y-COMPARTIR.md.
--
-- Qué hace:
--  1. Todo lo que existe hoy (biblioteca, documentos guardados, presets y diseño
--     predeterminado) pasa a ser de TU cuenta.
--  2. Cada tabla queda protegida: cada persona solo ve y toca lo suyo.
--  3. La biblioteca es privada, y el dueño puede compartir una página con otra
--     cuenta por correo (la otra persona solo la ve y la usa; no la edita ni borra).
--
-- ⚠ Antes de correrlo, cambia el correo de la línea marcada por el de TU cuenta.
-- ⚠ Al terminar, la versión VIEJA de la app (la que no pide sesión) deja de poder
--   leer ni guardar. Publica la versión nueva justo después.

-- 1) Dueño de todo lo existente ------------------------------------------------
do $$
declare
  owner uuid;
begin
  select id into owner from auth.users
  where lower(email) = lower('TU_CORREO@ejemplo.com');   -- ← cambia esto por tu correo

  if owner is null then
    raise exception 'No existe ninguna cuenta con ese correo. Crea tu cuenta primero en la app y revisa que el correo esté bien escrito.';
  end if;

  alter table saved_documents add column if not exists user_id uuid references auth.users(id) on delete cascade;
  update saved_documents set user_id = owner where user_id is null;
  alter table saved_documents alter column user_id set default auth.uid();
  alter table saved_documents alter column user_id set not null;

  alter table design_presets add column if not exists user_id uuid references auth.users(id) on delete cascade;
  update design_presets set user_id = owner where user_id is null;
  alter table design_presets alter column user_id set default auth.uid();
  alter table design_presets alter column user_id set not null;

  alter table default_design add column if not exists user_id uuid references auth.users(id) on delete cascade;
  update default_design set user_id = owner where user_id is null;
  alter table default_design drop constraint if exists default_design_single_row;
  alter table default_design drop constraint if exists default_design_pkey;
  alter table default_design drop column if exists id;
  alter table default_design alter column user_id set default auth.uid();
  alter table default_design alter column user_id set not null;
  alter table default_design add primary key (user_id);

  alter table library_pages add column if not exists user_id uuid references auth.users(id) on delete cascade;
  update library_pages set user_id = owner where user_id is null;
  alter table library_pages alter column user_id set default auth.uid();
  alter table library_pages alter column user_id set not null;
end $$;

create index if not exists saved_documents_user_id_idx on saved_documents (user_id);
create index if not exists design_presets_user_id_idx on design_presets (user_id);
create index if not exists library_pages_user_id_idx on library_pages (user_id);

-- 2) Perfiles (correo de cada cuenta) y páginas compartidas -------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null
);
insert into profiles (id, email) select id, email from auth.users on conflict (id) do update set email = excluded.email;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create table if not exists library_shares (
  page_id text not null references library_pages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (page_id, user_id)
);
create index if not exists library_shares_user_id_idx on library_shares (user_id);

-- 3) Quita las reglas viejas de "acceso total para cualquiera" ---------------
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('library_pages', 'library_page_assets', 'saved_documents', 'saved_document_fichas',
                        'saved_document_mapas', 'saved_document_assets', 'design_presets', 'default_design',
                        'profiles', 'library_shares')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table library_pages enable row level security;
alter table library_page_assets enable row level security;
alter table saved_documents enable row level security;
alter table saved_document_fichas enable row level security;
alter table saved_document_mapas enable row level security;
alter table saved_document_assets enable row level security;
alter table design_presets enable row level security;
alter table default_design enable row level security;
alter table profiles enable row level security;
alter table library_shares enable row level security;

-- 4) Reglas nuevas: solo con sesión iniciada y solo lo propio ----------------
create policy "own saved_documents" on saved_documents
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own saved_document_fichas" on saved_document_fichas
  for all to authenticated
  using (exists (select 1 from saved_documents d where d.id = saved_document_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from saved_documents d where d.id = saved_document_id and d.user_id = (select auth.uid())));

create policy "own saved_document_mapas" on saved_document_mapas
  for all to authenticated
  using (exists (select 1 from saved_documents d where d.id = saved_document_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from saved_documents d where d.id = saved_document_id and d.user_id = (select auth.uid())));

create policy "own saved_document_assets" on saved_document_assets
  for all to authenticated
  using (exists (select 1 from saved_documents d where d.id = saved_document_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from saved_documents d where d.id = saved_document_id and d.user_id = (select auth.uid())));

create policy "own design_presets" on design_presets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own default_design" on default_design
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Biblioteca: el dueño hace todo; quien recibe una página compartida solo la ve.
create policy "library select own or shared" on library_pages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from library_shares s where s.page_id = library_pages.id and s.user_id = (select auth.uid()))
  );
create policy "library insert own" on library_pages
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "library update own" on library_pages
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "library delete own" on library_pages
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "library assets select" on library_page_assets
  for select to authenticated
  using (exists (
    select 1 from library_pages p
    where p.id = page_id
      and (p.user_id = (select auth.uid())
           or exists (select 1 from library_shares s where s.page_id = p.id and s.user_id = (select auth.uid())))
  ));
create policy "library assets insert own" on library_page_assets
  for insert to authenticated
  with check (exists (select 1 from library_pages p where p.id = page_id and p.user_id = (select auth.uid())));
create policy "library assets update own" on library_page_assets
  for update to authenticated
  using (exists (select 1 from library_pages p where p.id = page_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from library_pages p where p.id = page_id and p.user_id = (select auth.uid())));
create policy "library assets delete own" on library_page_assets
  for delete to authenticated
  using (exists (select 1 from library_pages p where p.id = page_id and p.user_id = (select auth.uid())));

-- Perfiles: ves el tuyo y el de quien te compartió algo.
create policy "profiles select own or sharer" on profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from library_pages p join library_shares s on s.page_id = p.id
      where p.user_id = profiles.id and s.user_id = (select auth.uid())
    )
  );

-- Lo que te compartieron (solo lectura; compartir y quitar pasan por las funciones de abajo).
create policy "shares select recipient" on library_shares
  for select to authenticated using (user_id = (select auth.uid()));

-- 5) Funciones para compartir (solo las puede llamar quien tiene sesión) -----
create or replace function share_library_page(p_page text, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not exists (select 1 from library_pages where id = p_page and user_id = auth.uid()) then
    raise exception 'No eres el dueño de esta página.';
  end if;
  select id into target from auth.users where lower(email) = lower(trim(p_email));
  if target is null then return 'not_found'; end if;
  if target = auth.uid() then return 'self'; end if;
  insert into library_shares (page_id, user_id) values (p_page, target) on conflict do nothing;
  return 'ok';
end $$;

create or replace function list_library_shares(p_page text) returns table (user_id uuid, email text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from library_pages where id = p_page and user_id = auth.uid()) then
    raise exception 'No eres el dueño de esta página.';
  end if;
  return query select s.user_id, u.email::text from library_shares s join auth.users u on u.id = s.user_id
               where s.page_id = p_page order by s.created_at;
end $$;

create or replace function unshare_library_page(p_page text, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from library_pages where id = p_page and user_id = auth.uid()) then
    raise exception 'No eres el dueño de esta página.';
  end if;
  delete from library_shares where page_id = p_page and user_id = p_user;
end $$;

revoke all on function share_library_page(text, text) from public, anon;
revoke all on function list_library_shares(text) from public, anon;
revoke all on function unshare_library_page(text, uuid) from public, anon;
grant execute on function share_library_page(text, text) to authenticated;
grant execute on function list_library_shares(text) to authenticated;
grant execute on function unshare_library_page(text, uuid) to authenticated;
