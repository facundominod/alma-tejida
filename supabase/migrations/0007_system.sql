-- =============================================================================
-- Alma Tejida · 0007 · Notificaciones, analiticas, auditoria, rate limit
-- =============================================================================

-- Zona horaria del negocio. Usada para que "ventas de hoy" signifique hoy aca,
-- no hoy en UTC. AT TIME ZONE con zona literal es IMMUTABLE, asi que puede
-- usarse en columnas generadas e indices.
create or replace function public.store_timezone()
returns text language sql immutable parallel safe as $$ select 'America/Argentina/Cordoba'::text $$;


-- -----------------------------------------------------------------------------
-- notifications  (puntos 78, 98, 99, 152-154)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  audience    public.notification_audience not null,
  -- null cuando audience = 'admin' (va al centro de notificaciones del panel)
  user_id     uuid references public.profiles(id) on delete cascade,

  type        text not null,          -- 'order_created', 'question_asked', 'low_stock', ...
  title       text not null,
  body        text,
  link        text,                   -- a donde lleva al tocarla
  entity_type text,
  entity_id   uuid,

  -- agrupa eventos del mismo hecho para no generar 15 alertas por una
  -- sola compra (punto 99)
  group_key   text,

  read_at     timestamptz,
  created_at  timestamptz not null default now(),

  constraint notifications_customer_has_user check (
    audience <> 'customer' or user_id is not null
  ),
  constraint notifications_admin_has_no_user check (
    audience <> 'admin' or user_id is null
  )
);

create index notifications_admin_idx
  on public.notifications (created_at desc)
  where audience = 'admin';
create index notifications_admin_unread_idx
  on public.notifications (created_at desc)
  where audience = 'admin' and read_at is null;
create index notifications_customer_idx
  on public.notifications (user_id, created_at desc)
  where audience = 'customer';
create index notifications_group_idx
  on public.notifications (group_key) where group_key is not null;


-- -----------------------------------------------------------------------------
-- analiticas  (puntos 91-96, 174)
-- -----------------------------------------------------------------------------
create type public.analytics_event_type as enum (
  'product_view',
  'gallery_image_view',
  'video_play',
  'category_view',
  'search',
  'add_to_cart',
  'checkout_started',
  'order_created',
  'order_paid',
  'whatsapp_click'
);

-- Crudo. TTL 90 dias, solo para drill-down.
create table public.analytics_events (
  id          bigint generated always as identity primary key,
  event_type  public.analytics_event_type not null,
  product_id  uuid references public.products(id) on delete cascade,
  variant_id  uuid references public.product_variants(id) on delete set null,
  category_id uuid references public.categories(id) on delete cascade,
  media_id    uuid references public.product_media(id) on delete set null,
  -- identificador de sesion anonimo, rotativo. No identifica personas (punto 93).
  session_id  text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  event_day   date generated always as (
    (created_at at time zone 'America/Argentina/Cordoba')::date
  ) stored
);

comment on table public.analytics_events is
  'No se almacena cada movimiento del mouse. Solo eventos significativos (punto 94).';

-- DEDUPE REAL (punto 174): apretar F5 cincuenta veces suma UNA visita.
create unique index analytics_product_view_dedupe
  on public.analytics_events (session_id, product_id, event_day)
  where event_type = 'product_view' and product_id is not null;

create unique index analytics_gallery_view_dedupe
  on public.analytics_events (session_id, media_id, event_day)
  where event_type = 'gallery_image_view' and media_id is not null;

create unique index analytics_category_view_dedupe
  on public.analytics_events (session_id, category_id, event_day)
  where event_type = 'category_view' and category_id is not null;

create index analytics_events_day_idx  on public.analytics_events (event_day desc, event_type);
create index analytics_events_prod_idx on public.analytics_events (product_id, event_day desc);


-- Agregado. Es lo unico que lee el dashboard (punto 94).
create table public.analytics_daily (
  day         date not null,
  event_type  public.analytics_event_type not null,
  product_id  uuid references public.products(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  count       integer not null default 0,

  constraint analytics_daily_count_positive check (count >= 0)
);

create unique index analytics_daily_key
  on public.analytics_daily (
    day, event_type,
    coalesce(product_id,  '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index analytics_daily_day_idx on public.analytics_daily (day desc, event_type);
create index analytics_daily_product_idx on public.analytics_daily (product_id, day desc)
  where product_id is not null;


-- Cada evento crudo incrementa el agregado en la misma transaccion.
-- El dashboard nunca recorre la tabla cruda.
create or replace function public.rollup_analytics_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.analytics_daily (day, event_type, product_id, category_id, count)
  values (new.event_day, new.event_type, new.product_id, new.category_id, 1)
  on conflict (
    day, event_type,
    coalesce(product_id,  '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  do update set count = public.analytics_daily.count + 1;

  return new;
end;
$$;

create trigger analytics_events_rollup
  after insert on public.analytics_events
  for each row execute function public.rollup_analytics_event();


-- -----------------------------------------------------------------------------
-- audit_log  (punto 144)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,          -- 'price.update', 'stock.adjust', 'order.status', ...
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.audit_log is
  'Los jsonb se filtran en la aplicacion para que jamas contengan tokens ni credenciales (punto 145).';

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx  on public.audit_log (actor_id, created_at desc);
create index audit_log_date_idx   on public.audit_log (created_at desc);


-- -----------------------------------------------------------------------------
-- rate limiting  (punto 159)
--   Sin Redis ni servicios pagos: una tabla y una funcion atomica.
-- -----------------------------------------------------------------------------
create table public.rate_limit_hits (
  bucket_key   text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket_key, window_start)
);

create index rate_limit_window_idx on public.rate_limit_hits (window_start);

-- Devuelve true si la accion esta PERMITIDA, false si supero el limite.
create or replace function public.check_rate_limit(
  p_key            text,
  p_max            integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  -- ventana fija: todos los intentos del mismo intervalo comparten fila
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_hits (bucket_key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (bucket_key, window_start)
  do update set count = public.rate_limit_hits.count + 1
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;


-- Limpieza: eventos crudos > 90 dias, ventanas de rate limit > 1 dia,
-- carritos anonimos abandonados > 60 dias. Se invoca desde un cron de Vercel.
create or replace function public.purge_old_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_events integer;
  v_limits integer;
  v_carts  integer;
begin
  delete from public.analytics_events
   where created_at < now() - interval '90 days';
  get diagnostics v_events = row_count;

  delete from public.rate_limit_hits
   where window_start < now() - interval '1 day';
  get diagnostics v_limits = row_count;

  delete from public.carts
   where status = 'active'
     and user_id is null
     and updated_at < now() - interval '60 days';
  get diagnostics v_carts = row_count;

  return jsonb_build_object(
    'analytics_events_deleted', v_events,
    'rate_limit_hits_deleted',  v_limits,
    'anon_carts_deleted',       v_carts
  );
end;
$$;

revoke all on function public.purge_old_data() from public;
