-- Ejecutar una vez en Supabase › SQL Editor
create table if not exists public.bancard_records (
  c   text  not null,
  id  text  not null,
  rec jsonb not null,
  primary key (c, id)
);
-- Nadie accede desde el navegador: solo el servidor con la clave "service_role".
alter table public.bancard_records enable row level security;
