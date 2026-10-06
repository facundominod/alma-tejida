-- =============================================================================
-- 0015 · NOMBRE DE USUARIO
--
-- Supabase identifica las cuentas por correo. Esta migración agrega un nombre
-- de usuario para ENTRAR, sin reemplazar al correo como identidad.
--
-- Por qué el correo se sigue pidiendo aunque no se use para entrar: es la
-- única forma de recuperar una cuenta. Sin correo, quien olvida su contraseña
-- no la recupera nadie —haría falta entrar a la base a mano—, y eso no escala
-- más allá de la dueña de la tienda.
-- =============================================================================

alter table public.profiles
  add column if not exists username text;

comment on column public.profiles.username is
  'Nombre para entrar. El correo sigue siendo la identidad y la via de recuperacion.';

-- Sin arroba a proposito: es lo que permite distinguir, al momento de entrar,
-- si lo que escribieron es un usuario o un correo, sin preguntar.
alter table public.profiles
  drop constraint if exists profiles_username_formato;

alter table public.profiles
  add constraint profiles_username_formato check (
    username is null
    or (
      length(username) between 3 and 24
      and username ~ '^[A-Za-z][A-Za-z0-9._-]*$'
    )
  );

-- "Silvana" y "silvana" son la misma persona. Se guarda como la escribio
-- —para mostrarlo bien— y se compara siempre en minuscula.
create unique index if not exists profiles_username_key
  on public.profiles (lower(username))
  where username is not null;


-- -----------------------------------------------------------------------------
-- Nombres que nadie puede tomar
--
-- Alguien registrado como "soporte" o "almatejida" puede responder una
-- pregunta en una ficha de producto y parecer la tienda. Es gratis evitarlo
-- ahora y es un problema feo despues.
-- -----------------------------------------------------------------------------
create table if not exists public.reserved_usernames (
  name text primary key
);

alter table public.reserved_usernames enable row level security;
revoke all on public.reserved_usernames from anon, authenticated;

insert into public.reserved_usernames (name) values
  ('admin'), ('administrador'), ('administradora'), ('root'), ('sistema'),
  ('soporte'), ('ayuda'), ('contacto'), ('ventas'), ('pedidos'),
  ('alma'), ('tejida'), ('almatejida'), ('alma_tejida'), ('alma-tejida'),
  ('moderador'), ('moderadora'), ('oficial'), ('tienda'), ('null'), ('undefined')
on conflict (name) do nothing;


-- -----------------------------------------------------------------------------
-- El perfil se crea con el nombre de usuario que vino del registro
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_username text;
begin
  v_username := nullif(trim(coalesce(new.raw_user_meta_data ->> 'username', '')), '');

  insert into public.profiles (id, email, full_name, phone, username, role)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    v_username,
    -- El rol se sigue forzando a 'customer' de forma incondicional. No existe
    -- camino desde el registro publico hacia admin (punto 156).
    'customer'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- De nombre de usuario a correo
--
-- La usa el servidor al iniciar sesion: Supabase necesita el correo, y la
-- persona escribio un nombre.
--
-- SOLO service_role. Si anon pudiera ejecutarla, cualquiera averiguaria el
-- correo de cualquier clienta probando nombres, que es exactamente la fuga que
-- el nombre de usuario deberia evitar.
-- -----------------------------------------------------------------------------
create or replace function public.email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.email
    from public.profiles p
   where p.username is not null
     and lower(p.username) = lower(trim(p_username))
   limit 1
$$;

revoke all on function public.email_for_username(text) from public, anon, authenticated;
grant execute on function public.email_for_username(text) to service_role;


-- -----------------------------------------------------------------------------
-- ¿Esta libre este nombre?
--
-- Devuelve un booleano y nada mas: ni correo, ni nombre, ni si la cuenta
-- existe de otra forma. Tambien es solo de service_role, porque aun un si/no
-- repetido permite enumerar quien esta registrado.
-- -----------------------------------------------------------------------------
create or replace function public.username_disponible(p_username text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select not exists (
    select 1 from public.profiles
     where username is not null and lower(username) = lower(trim(p_username))
  ) and not exists (
    select 1 from public.reserved_usernames
     where name = lower(trim(p_username))
  )
$$;

revoke all on function public.username_disponible(text) from public, anon, authenticated;
grant execute on function public.username_disponible(text) to service_role;
