-- FichaFlow — esquema para compartir biblioteca y diseño predeterminado
-- entre dispositivos (escritorio + iPhone) y entre las personas que
-- comparten esta app. Ya se corrió una vez contra el proyecto de
-- Supabase en uso — este archivo se conserva como referencia, por si
-- alguna vez hay que recrear el proyecto desde cero.

-- Cada página guardada en la biblioteca es su propia fila — así, si dos
-- personas agregan una página cada quien al mismo tiempo desde
-- dispositivos distintos, no hay ningún choque: son dos inserciones
-- independientes, no una sola lista que se sobreescribe completa.
create table if not exists library_pages (
  id text primary key,
  saved_at bigint not null,
  ficha jsonb not null
);

-- El diseño predeterminado sí es un solo objeto compartido (no una
-- lista), así que es una tabla de una sola fila fija (id siempre 1).
create table if not exists default_design (
  id int primary key default 1,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  constraint default_design_single_row check (id = 1)
);

-- Presets con nombre ("Piedra Caliza", "FINAL", etc.) — igual que
-- library_pages, una fila por preset, para poder guardar varias
-- configuraciones y alternar entre ellas sin ajustar todo a mano.
create table if not exists design_presets (
  id text primary key,
  name text not null,
  saved_at bigint not null,
  value jsonb not null
);

alter table library_pages enable row level security;
alter table default_design enable row level security;
alter table design_presets enable row level security;

-- Acceso abierto para la llave "anon" (la misma que vive en js/sync.js)
-- — es la llave pública que va en el código de la app, protegida solo
-- por no ser conocida fuera del grupo que la usa. No hay contraseñas
-- de por medio; es un espacio compartido, no cuentas individuales.
create policy "anon full access to library_pages" on library_pages
  for all using (true) with check (true);

create policy "anon full access to default_design" on default_design
  for all using (true) with check (true);

create policy "anon full access to design_presets" on design_presets
  for all using (true) with check (true);
