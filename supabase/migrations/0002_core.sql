-- =============================================================================
-- Alma Tejida · 0002 · Identidad, configuracion de tienda y categorias
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  role              public.user_role not null default 'customer',
  full_name         text,
  email             text,
  phone             text,
  accepts_marketing boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is
  'Datos de negocio del usuario. El rol NUNCA se asigna desde el registro publico.';

create index profiles_role_idx on public.profiles (role) where role = 'admin';
create unique index profiles_email_key on public.profiles (lower(email)) where email is not null;

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();


-- Al crearse un usuario en auth, se crea su profile.
-- El rol se fuerza a 'customer' de forma incondicional: no existe camino
-- desde el registro publico hacia el rol admin (punto 156).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    'customer'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- is_admin() - la piedra angular de la autorizacion
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER para poder leer profiles sin caer en recursion de policies.
-- `set search_path` es OBLIGATORIO: sin el, un usuario podria crear un esquema
-- propio con una tabla profiles falsa y secuestrar la funcion.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;


-- Rol actual, leido sin pasar por RLS. Se usa en la policy de UPDATE de
-- profiles: una subconsulta a profiles DENTRO de una policy de profiles
-- puede recursar, asi que se resuelve con esta funcion en su lugar.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;


-- -----------------------------------------------------------------------------
-- store_settings  (fila unica)
-- -----------------------------------------------------------------------------
create table public.store_settings (
  id                 smallint primary key default 1,
  store_name         text not null default 'Alma Tejida',
  tagline            text not null default 'Creaciones que unen arte y esencia',
  logo_url           text,
  logo_mark_url      text,
  og_image_url       text,

  -- contacto (punto 117)
  whatsapp_number    text,              -- formato internacional sin signos: 5493511234567
  phone              text,
  contact_email      text,
  address            text,
  opening_hours      text,
  socials            jsonb not null default '{}'::jsonb,   -- {instagram, facebook, tiktok, ...}

  -- pago por transferencia (punto 65). Datos del COMERCIO, no del cliente.
  payment_alias      text,
  payment_bank       text,
  payment_holder     text,
  payment_cbu        text,
  payment_instructions text,

  -- metodos de entrega configurables (punto 118)
  -- [{key, label, description, requires_address, price, is_active}]
  delivery_methods   jsonb not null default '[]'::jsonb,

  -- textos editables del home (punto 181)
  home_hero          jsonb not null default '{}'::jsonb,
  home_sections      jsonb not null default '{}'::jsonb,
  about_text         text,

  -- politica por defecto para productos nuevos
  default_stock_display      public.stock_display_mode not null default 'vague',
  default_low_stock_threshold integer not null default 2,

  currency           text not null default 'ARS',
  is_open            boolean not null default true,     -- permite "cerrar" la tienda temporalmente
  closed_message     text,

  updated_at         timestamptz not null default now(),

  constraint store_settings_singleton check (id = 1),
  constraint store_settings_threshold_positive check (default_low_stock_threshold >= 0)
);

comment on table public.store_settings is
  'Fila unica. Todo lo que el administrador configura sin tocar codigo (punto 118).';

create trigger store_settings_touch
  before update on public.store_settings
  for each row execute function public.touch_updated_at();

insert into public.store_settings (id) values (1);


-- -----------------------------------------------------------------------------
-- categories  (self-FK: subcategorias preparadas sin complicar la UI)
-- -----------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories(id) on delete set null,
  name        text not null,
  slug        text not null,
  description text,
  image_path  text,
  position    integer not null default 0,
  is_visible  boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint categories_name_not_blank check (length(trim(name)) > 0),
  constraint categories_not_self_parent check (parent_id is distinct from id)
);

create unique index categories_slug_key on public.categories (slug) where deleted_at is null;
create index categories_parent_idx on public.categories (parent_id, position);
create index categories_visible_idx on public.categories (position)
  where is_visible and deleted_at is null;

create trigger categories_touch
  before update on public.categories
  for each row execute function public.touch_updated_at();
