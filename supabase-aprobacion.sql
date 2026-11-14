-- propentia — aprobación manual de cuentas + panel de administración
--
-- Se corre UNA sola vez en Supabase → SQL Editor, DESPUÉS de haber corrido supabase-cuentas.sql.
-- Ver CUENTAS-Y-COMPARTIR.md (sección "Aprobar cuentas").
--
-- Qué hace:
--  1. Cada cuenta nueva queda "pendiente": puede entrar y recorrer la app, pero no crear ni
--     guardar nada hasta que tú la apruebes.
--  2. Las cuentas que YA existen quedan aprobadas, y la tuya queda como administrador.
--  3. Crea las funciones del panel de Administración (solo las puede usar un administrador).
--
-- ⚠ Antes de correrlo, cambia el correo de la línea marcada por el de TU cuenta (la misma de antes).

-- 1) Estado y datos de cada cuenta -------------------------------------------
alter table profiles add column if not exists status text not null default 'pending';
alter table profiles add column if not exists is_admin boolean not null default false;
alter table profiles add column if not exists nombre text;
alter table profiles add column if not exists empresa text;
alter table profiles add column if not exists telefono text;
alter table profiles add column if not exists created_at timestamptz not null default now();
alter table profiles add column if not exists approved_at timestamptz;

alter table profiles drop constraint if exists profiles_status_check;
alter table profiles add constraint profiles_status_check
  check (status in ('pending', 'approved', 'rejected', 'suspended'));

do $$
declare
  owner uuid;
begin
  select id into owner from auth.users
  where lower(email) = lower('TU_CORREO@ejemplo.com');   -- ← cambia esto por tu correo

  if owner is null then
    raise exception 'No existe ninguna cuenta con ese correo. Revisa que esté bien escrito.';
  end if;

  -- Las cuentas que ya existían quedan aprobadas (nadie queda fuera por este cambio).
  update profiles set status = 'approved', approved_at = coalesce(approved_at, now()) where status = 'pending';
  -- Tú, administrador.
  update profiles set is_admin = true, status = 'approved', approved_at = coalesce(approved_at, now()) where id = owner;
end $$;

-- 2) Las cuentas nuevas nacen pendientes y guardan los datos del registro -----
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, status, nombre, empresa, telefono)
  values (
    new.id, new.email, 'pending',
    nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'empresa'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'telefono'), '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- 3) Ayudantes: ¿esta cuenta está aprobada? ¿es administradora? ---------------
create or replace function is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved');
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_admin and status = 'approved');
$$;

revoke all on function is_approved() from public, anon;
revoke all on function is_admin() from public, anon;
grant execute on function is_approved() to authenticated;
grant execute on function is_admin() to authenticated;

-- 4) Las reglas de cada tabla ahora exigen cuenta aprobada -------------------
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

create policy "own saved_documents" on saved_documents
  for all to authenticated
  using (user_id = (select auth.uid()) and (select is_approved()))
  with check (user_id = (select auth.uid()) and (select is_approved()));

create policy "own saved_document_fichas" on saved_document_fichas
  for all to authenticated
  using ((select is_approved()) and exists (select 1 from saved_documents d where d.id = saved_document_id and d.user_id = (select auth.uid())))
  with check ((select is_approved()) and exists (select 1 from saved_documents d where d.id = saved_document_id and d.user_id = (select auth.uid())));

create policy "own saved_document_mapas" on saved_document_mapas
  for all to authenticated
  using ((select is_approved()) and exists (select 1 from saved_documents d where d.id = saved_document_id and d.user_id = (select auth.uid())))
  with check ((select is_approved()) and exists (select 1 from saved_documents d where d.id = saved_document_id and d.user_id = (select auth.uid())));

create policy "own saved_document_assets" on saved_document_assets
  for all to authenticated
  using ((select is_approved()) and exists (select 1 from saved_documents d where d.id = saved_document_id and d.user_id = (select auth.uid())))
  with check ((select is_approved()) and exists (select 1 from saved_documents d where d.id = saved_document_id and d.user_id = (select auth.uid())));

create policy "own design_presets" on design_presets
  for all to authenticated
  using (user_id = (select auth.uid()) and (select is_approved()))
  with check (user_id = (select auth.uid()) and (select is_approved()));

create policy "own default_design" on default_design
  for all to authenticated
  using (user_id = (select auth.uid()) and (select is_approved()))
  with check (user_id = (select auth.uid()) and (select is_approved()));

create policy "library select own or shared" on library_pages
  for select to authenticated
  using (
    (select is_approved())
    and (
      user_id = (select auth.uid())
      or exists (select 1 from library_shares s where s.page_id = library_pages.id and s.user_id = (select auth.uid()))
    )
  );
create policy "library insert own" on library_pages
  for insert to authenticated with check (user_id = (select auth.uid()) and (select is_approved()));
create policy "library update own" on library_pages
  for update to authenticated
  using (user_id = (select auth.uid()) and (select is_approved()))
  with check (user_id = (select auth.uid()) and (select is_approved()));
create policy "library delete own" on library_pages
  for delete to authenticated using (user_id = (select auth.uid()) and (select is_approved()));

create policy "library assets select" on library_page_assets
  for select to authenticated
  using ((select is_approved()) and exists (
    select 1 from library_pages p
    where p.id = page_id
      and (p.user_id = (select auth.uid())
           or exists (select 1 from library_shares s where s.page_id = p.id and s.user_id = (select auth.uid())))
  ));
create policy "library assets insert own" on library_page_assets
  for insert to authenticated
  with check ((select is_approved()) and exists (select 1 from library_pages p where p.id = page_id and p.user_id = (select auth.uid())));
create policy "library assets update own" on library_page_assets
  for update to authenticated
  using ((select is_approved()) and exists (select 1 from library_pages p where p.id = page_id and p.user_id = (select auth.uid())))
  with check ((select is_approved()) and exists (select 1 from library_pages p where p.id = page_id and p.user_id = (select auth.uid())));
create policy "library assets delete own" on library_page_assets
  for delete to authenticated
  using ((select is_approved()) and exists (select 1 from library_pages p where p.id = page_id and p.user_id = (select auth.uid())));

-- Perfiles: ves el tuyo (así sabes si ya te aprobaron) y el de quien te compartió algo.
-- Nadie puede modificar su propio perfil: el estado solo cambia con las funciones de abajo.
create policy "profiles select own or sharer" on profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from library_pages p join library_shares s on s.page_id = p.id
      where p.user_id = profiles.id and s.user_id = (select auth.uid())
    )
  );

create policy "shares select recipient" on library_shares
  for select to authenticated using (user_id = (select auth.uid()) and (select is_approved()));

-- 5) Compartir páginas: solo cuentas aprobadas --------------------------------
create or replace function share_library_page(p_page text, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not is_approved() then raise exception 'Tu cuenta todavía no está aprobada.'; end if;
  if not exists (select 1 from library_pages where id = p_page and user_id = auth.uid()) then
    raise exception 'No eres el dueño de esta página.';
  end if;
  select u.id into target from auth.users u
    join profiles pr on pr.id = u.id and pr.status = 'approved'
    where lower(u.email) = lower(trim(p_email));
  if target is null then return 'not_found'; end if;
  if target = auth.uid() then return 'self'; end if;
  insert into library_shares (page_id, user_id) values (p_page, target) on conflict do nothing;
  return 'ok';
end $$;

-- 6) Panel de administración (solo administradores) ---------------------------
create or replace function admin_list_users() returns table (
  user_id uuid, email text, nombre text, empresa text, telefono text, status text, is_admin boolean,
  created_at timestamptz, approved_at timestamptz, last_sign_in_at timestamptz, proyectos bigint, documentos bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo para administradores.'; end if;
  return query
    select p.id, p.email, p.nombre, p.empresa, p.telefono, p.status, p.is_admin,
           p.created_at, p.approved_at, u.last_sign_in_at,
           (select count(*) from library_pages l where l.user_id = p.id),
           (select count(*) from saved_documents d where d.user_id = p.id)
    from profiles p left join auth.users u on u.id = p.id
    order by (p.status = 'pending') desc, p.created_at desc;
end $$;

create or replace function admin_set_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo para administradores.'; end if;
  if p_status not in ('pending', 'approved', 'rejected', 'suspended') then raise exception 'Estado no válido.'; end if;
  if p_user = auth.uid() then raise exception 'No puedes cambiar el estado de tu propia cuenta.'; end if;
  update profiles
     set status = p_status,
         approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end
   where id = p_user;
end $$;

revoke all on function admin_list_users() from public, anon;
revoke all on function admin_set_status(uuid, text) from public, anon;
revoke all on function share_library_page(text, text) from public, anon;
grant execute on function admin_list_users() to authenticated;
grant execute on function admin_set_status(uuid, text) to authenticated;
grant execute on function share_library_page(text, text) to authenticated;
