-- FichaFlow — cuentas por usuario (correo + contraseña)
--
-- Se corre UNA sola vez en Supabase → SQL Editor, DESPUÉS de crear tu
-- propia cuenta (ver README, sección "Inicio de sesión"). Todo lo que ya
-- existe hoy (documentos guardados, presets y diseño predeterminado)
-- pasa a ser de esa cuenta; nadie más lo ve.
--
-- La biblioteca (library_pages / library_page_assets) NO se toca aquí:
-- sigue siendo el espacio compartido de siempre, a propósito, por ahora.
--
-- ⚠ Antes de correrlo, cambia el correo de la línea marcada abajo por el
--   de TU cuenta.

do $$
declare
  owner uuid;
begin
  select id into owner from auth.users
  where email = 'TU_CORREO@ejemplo.com';   -- ← cambia esto por tu correo

  if owner is null then
    raise exception 'No existe ninguna cuenta con ese correo. Crea tu cuenta primero y revisa que el correo esté bien escrito.';
  end if;

  -- Documentos guardados: cada uno con su dueño. Las filas hijas
  -- (fichas, mapas, imágenes) heredan el dueño de su documento.
  alter table saved_documents add column if not exists user_id uuid references auth.users(id) on delete cascade;
  update saved_documents set user_id = owner where user_id is null;
  alter table saved_documents alter column user_id set default auth.uid();
  alter table saved_documents alter column user_id set not null;

  -- Presets de diseño con nombre.
  alter table design_presets add column if not exists user_id uuid references auth.users(id) on delete cascade;
  update design_presets set user_id = owner where user_id is null;
  alter table design_presets alter column user_id set default auth.uid();
  alter table design_presets alter column user_id set not null;

  -- Diseño predeterminado: deja de ser una sola fila fija (id = 1) para
  -- todos y pasa a ser una fila por usuario.
  alter table default_design add column if not exists user_id uuid references auth.users(id) on delete cascade;
  update default_design set user_id = owner where user_id is null;
  alter table default_design drop constraint if exists default_design_single_row;
  alter table default_design drop constraint if exists default_design_pkey;
  alter table default_design drop column if exists id;
  alter table default_design alter column user_id set default auth.uid();
  alter table default_design alter column user_id set not null;
  alter table default_design add primary key (user_id);
end $$;

create index if not exists saved_documents_user_id_idx on saved_documents (user_id);
create index if not exists design_presets_user_id_idx on design_presets (user_id);

-- Quita las reglas viejas de "acceso total para cualquiera" de estas
-- tablas (sus nombres variaban de tabla en tabla, así que se borran
-- todas las que haya en vez de por nombre).
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('saved_documents', 'saved_document_fichas', 'saved_document_mapas',
                        'saved_document_assets', 'design_presets', 'default_design')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table saved_documents enable row level security;
alter table saved_document_fichas enable row level security;
alter table saved_document_mapas enable row level security;
alter table saved_document_assets enable row level security;
alter table design_presets enable row level security;
alter table default_design enable row level security;

-- Solo con sesión iniciada, y solo tus propias filas.
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
