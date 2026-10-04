-- =============================================================================
-- Alma Tejida · 0001 · Extensiones, enums y utilidades base
-- =============================================================================

create schema if not exists extensions;

create extension if not exists pgcrypto  with schema extensions;
create extension if not exists pg_trgm   with schema extensions;
create extension if not exists unaccent  with schema extensions;

-- unaccent() no es IMMUTABLE (depende del diccionario cargado), por lo que no
-- puede usarse en indices ni columnas generadas. Este wrapper fija el
-- diccionario explicitamente y si lo es. Es el patron recomendado para
-- busqueda sin acentos en espanol.
create or replace function public.at_unaccent(text)
returns text
language sql
immutable
strict
parallel safe
set search_path = extensions, public, pg_temp
as $$
  select extensions.unaccent('extensions.unaccent', $1)
$$;


-- =============================================================================
-- ENUMS
-- =============================================================================

-- Roles. Hoy hay un solo administrador, pero el rol se modela como rol:
-- en ningun lugar del sistema se compara contra un email literal.
create type public.user_role as enum ('customer', 'admin');

create type public.product_status as enum ('draft', 'published', 'archived');

-- Como se consigue la pieza:
--   in_stock       : hay unidades fisicas
--   made_to_order  : se fabrica por encargo aunque el stock sea 0
--   unique_piece   : una sola, irrepetible; al venderse queda "vendida"
create type public.availability_mode as enum ('in_stock', 'made_to_order', 'unique_piece');

-- Cuanto stock ve el cliente. Lo decide el administrador por producto.
create type public.stock_display_mode as enum ('exact', 'vague', 'hidden');

-- Tipos de caracteristica que el administrador puede definir por producto.
create type public.attribute_type as enum ('select', 'text', 'number', 'measure', 'color');

create type public.media_type as enum ('image', 'video');

create type public.discount_type as enum ('percent', 'fixed_price', 'amount_off');

create type public.cart_status as enum ('active', 'converted', 'abandoned');

-- Seis estados, ni uno mas. La linea gruesa esta en 'paid':
-- ahi y solo ahi el stock fisico baja y el ingreso entra en la contabilidad.
create type public.order_status as enum (
  'pending',
  'contacted',
  'awaiting_payment',
  'paid',
  'preparing',
  'delivered',
  'cancelled'
);

-- Ninguna variacion de stock ocurre sin una fila de inventory_movements
-- con uno de estos tipos.
create type public.movement_type as enum (
  'initial',
  'restock',
  'reserve',
  'release',
  'sale',
  'cancellation',
  'adjustment'
);

create type public.question_status as enum ('pending', 'answered', 'published', 'hidden');

create type public.review_status as enum ('pending', 'approved', 'hidden');

create type public.notification_audience as enum ('admin', 'customer');

create type public.proof_status as enum ('pending', 'accepted', 'rejected');


-- =============================================================================
-- UTILIDADES
-- =============================================================================

-- updated_at se mantiene por trigger en todas las tablas de negocio.
-- Nunca se escribe a mano desde la aplicacion.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- Genera un slug limpio para URLs: "Manta Roma 1,50 x 2,00" -> "manta-roma-1-50-x-2-00"
create or replace function public.slugify(p_text text)
returns text
language sql
immutable
strict
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(public.at_unaccent(p_text)), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  )
$$;
