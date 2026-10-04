-- =============================================================================
-- Alma Tejida · 0013 · Funciones del panel de administracion
--
--   Gestion comercial simple, no un ERP (punto 86). Pocos numeros y utiles.
--   PEDIDO y VENTA COBRADA nunca se mezclan (punto 170).
-- =============================================================================

-- Estados que cuentan como venta confirmada. Un pedido pendiente NO es una venta.
create or replace function public.paid_statuses()
returns public.order_status[]
language sql immutable
as $$ select array['paid','preparing','delivered']::public.order_status[] $$;


-- -----------------------------------------------------------------------------
-- admin_dashboard - los 7 numeros del punto 85, mas la comparacion mensual
-- -----------------------------------------------------------------------------
create or replace function public.admin_dashboard(
  p_from date default null,
  p_to   date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz        text := 'America/Argentina/Cordoba';
  v_from      date;
  v_to        date;
  v_days      integer;
  v_prev_from date;
  v_prev_to   date;
  v_now       jsonb;
  v_prev      jsonb;
  v_result    jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- por defecto: el mes en curso, en hora de Argentina
  v_to   := coalesce(p_to,   (now() at time zone v_tz)::date);
  v_from := coalesce(p_from, date_trunc('month', (now() at time zone v_tz))::date);

  v_days      := greatest((v_to - v_from) + 1, 1);
  v_prev_to   := v_from - 1;
  v_prev_from := v_prev_to - (v_days - 1);

  -- periodo actual
  select jsonb_build_object(
    'orders_count',     count(*),
    'orders_amount',    coalesce(sum(o.total), 0),
    'sales_count',      count(*) filter (where o.status = any (public.paid_statuses())),
    'revenue',          coalesce(sum(o.total) filter (where o.status = any (public.paid_statuses())), 0),
    'pending_amount',   coalesce(sum(o.total) filter (where o.status in ('pending','contacted','awaiting_payment')), 0),
    'pending_count',    count(*) filter (where o.status in ('pending','contacted','awaiting_payment')),
    'cancelled_count',  count(*) filter (where o.status = 'cancelled'),
    'cancelled_amount', coalesce(sum(o.total) filter (where o.status = 'cancelled'), 0),
    'avg_ticket', case
      when count(*) filter (where o.status = any (public.paid_statuses())) > 0
      then round(
        coalesce(sum(o.total) filter (where o.status = any (public.paid_statuses())), 0)
        / count(*) filter (where o.status = any (public.paid_statuses())), 2)
      else 0 end
  )
  into v_now
  from public.orders o
  where (o.created_at at time zone v_tz)::date between v_from and v_to;

  -- periodo anterior, mismo largo (punto 88)
  select jsonb_build_object(
    'orders_count', count(*),
    'sales_count',  count(*) filter (where o.status = any (public.paid_statuses())),
    'revenue',      coalesce(sum(o.total) filter (where o.status = any (public.paid_statuses())), 0)
  )
  into v_prev
  from public.orders o
  where (o.created_at at time zone v_tz)::date between v_prev_from and v_prev_to;

  v_result := jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to, 'days', v_days),
    'previous_range', jsonb_build_object('from', v_prev_from, 'to', v_prev_to),
    'current',  v_now,
    'previous', v_prev,

    'units_sold', coalesce((
      select sum(oi.quantity)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.status = any (public.paid_statuses())
        and (o.created_at at time zone v_tz)::date between v_from and v_to
    ), 0),

    -- bandeja de entrada del administrador (punto 85)
    'unanswered_questions', (
      select count(*) from public.questions where status = 'pending'
    ),
    'pending_reviews', (
      select count(*) from public.reviews where status = 'pending'
    ),
    'unread_notifications', (
      select count(*) from public.notifications where audience = 'admin' and read_at is null
    ),
    'low_stock_count', (
      select count(*)
      from public.product_variants v
      join public.products p on p.id = v.product_id
      where v.is_active
        and p.status = 'published'
        and p.deleted_at is null
        and p.availability_mode <> 'made_to_order'
        and greatest(v.stock - v.reserved, 0)
            <= coalesce(v.low_stock_threshold, p.low_stock_threshold)
    ),
    'published_products', (
      select count(*) from public.products where status = 'published' and deleted_at is null
    )
  );

  return v_result;
end;
$$;

grant execute on function public.admin_dashboard(date, date) to authenticated;


-- -----------------------------------------------------------------------------
-- Ventas por dia - un grafico simple, no un dashboard gigante (punto 89)
-- -----------------------------------------------------------------------------
create or replace function public.admin_sales_by_day(
  p_from date,
  p_to   date
)
returns table (day date, orders_count integer, sales_count integer, revenue numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    d.day::date,
    count(o.id)::integer,
    count(o.id) filter (where o.status = any (public.paid_statuses()))::integer,
    coalesce(sum(o.total) filter (where o.status = any (public.paid_statuses())), 0)::numeric
  from generate_series(p_from, p_to, interval '1 day') d(day)
  left join public.orders o
    on (o.created_at at time zone 'America/Argentina/Cordoba')::date = d.day::date
  group by d.day
  order by d.day;
end;
$$;

grant execute on function public.admin_sales_by_day(date, date) to authenticated;


-- -----------------------------------------------------------------------------
-- Productos mas vendidos (punto 90)
--   Desde order_items historicos, JAMAS infiriendo desde el stock (punto 173):
--   el stock cambia por ajustes, roturas y regalos, y mentiria.
-- -----------------------------------------------------------------------------
create or replace function public.admin_top_products(
  p_from  date,
  p_to    date,
  p_by    text default 'units',      -- 'units' | 'amount'
  p_limit integer default 10
)
returns table (
  product_id uuid,
  name       text,
  slug       text,
  image_url  text,
  units      integer,
  amount     numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    oi.product_id,
    max(oi.product_name)::text,
    max(oi.product_slug)::text,
    max(oi.image_url)::text,
    sum(oi.quantity)::integer,
    sum(oi.line_total)::numeric
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.status = any (public.paid_statuses())
    and (o.created_at at time zone 'America/Argentina/Cordoba')::date between p_from and p_to
    and oi.product_id is not null
  group by oi.product_id
  order by
    case when p_by = 'amount' then sum(oi.line_total) else sum(oi.quantity) end desc
  limit least(coalesce(p_limit, 10), 50);
end;
$$;

grant execute on function public.admin_top_products(date, date, text, integer) to authenticated;


-- -----------------------------------------------------------------------------
-- Productos mas visitados (punto 91) - desde el AGREGADO, nunca desde el crudo
-- -----------------------------------------------------------------------------
create or replace function public.admin_top_viewed(
  p_from  date,
  p_to    date,
  p_limit integer default 10
)
returns table (product_id uuid, name text, slug text, views integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select ad.product_id, p.name, p.slug, sum(ad.count)::integer
  from public.analytics_daily ad
  join public.products p on p.id = ad.product_id
  where ad.event_type = 'product_view'
    and ad.day between p_from and p_to
    and ad.product_id is not null
  group by ad.product_id, p.name, p.slug
  order by sum(ad.count) desc
  limit least(coalesce(p_limit, 10), 50);
end;
$$;

grant execute on function public.admin_top_viewed(date, date, integer) to authenticated;


-- -----------------------------------------------------------------------------
-- Embudo de conversion (punto 96)
--     Visitas producto -> Agregado al carrito -> Pedido -> Venta
-- -----------------------------------------------------------------------------
create or replace function public.admin_funnel(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_views   integer;
  v_carts   integer;
  v_checkout integer;
  v_orders  integer;
  v_paid    integer;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select
    coalesce(sum(count) filter (where event_type = 'product_view'), 0),
    coalesce(sum(count) filter (where event_type = 'add_to_cart'), 0),
    coalesce(sum(count) filter (where event_type = 'checkout_started'), 0)
  into v_views, v_carts, v_checkout
  from public.analytics_daily
  where day between p_from and p_to;

  select
    count(*)::integer,
    count(*) filter (where status = any (public.paid_statuses()))::integer
  into v_orders, v_paid
  from public.orders
  where (created_at at time zone 'America/Argentina/Cordoba')::date between p_from and p_to;

  return jsonb_build_object(
    'product_views',    v_views,
    'add_to_cart',      v_carts,
    'checkout_started', v_checkout,
    'orders',           v_orders,
    'paid',             v_paid,
    'view_to_cart',  case when v_views  > 0 then round(v_carts  * 100.0 / v_views,  1) else 0 end,
    'cart_to_order', case when v_carts  > 0 then round(v_orders * 100.0 / v_carts,  1) else 0 end,
    'order_to_paid', case when v_orders > 0 then round(v_paid   * 100.0 / v_orders, 1) else 0 end
  );
end;
$$;

grant execute on function public.admin_funnel(date, date) to authenticated;


-- -----------------------------------------------------------------------------
-- Stock bajo (punto 97) - la lista que el administrador mira desde el celular
-- -----------------------------------------------------------------------------
create or replace function public.admin_low_stock(p_limit integer default 50)
returns table (
  variant_id    uuid,
  product_id    uuid,
  product_name  text,
  product_slug  text,
  variant_label text,
  stock         integer,
  reserved      integer,
  available     integer,
  threshold     integer,
  image_url     text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    v.id, p.id, p.name, p.slug,
    public.variant_label(v.id),
    v.stock, v.reserved,
    greatest(v.stock - v.reserved, 0),
    coalesce(v.low_stock_threshold, p.low_stock_threshold),
    (select coalesce(m.thumb_path, m.storage_path)
       from public.product_media m
      where m.product_id = p.id and m.type = 'image'
      order by m.is_cover desc, m.position asc limit 1)
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.is_active
    and p.status = 'published'
    and p.deleted_at is null
    and p.availability_mode <> 'made_to_order'
    and greatest(v.stock - v.reserved, 0)
        <= coalesce(v.low_stock_threshold, p.low_stock_threshold)
  order by greatest(v.stock - v.reserved, 0) asc, p.name asc
  limit least(coalesce(p_limit, 50), 200);
end;
$$;

grant execute on function public.admin_low_stock(integer) to authenticated;


-- -----------------------------------------------------------------------------
-- Vistas de exportacion CSV (punto 143)
--   El administrador no depende unicamente del dashboard.
-- -----------------------------------------------------------------------------
create or replace view public.v_orders_export
with (security_invoker = true) as
select
  o.order_number            as "Pedido",
  (o.created_at at time zone 'America/Argentina/Cordoba')::date as "Fecha",
  o.status                  as "Estado",
  o.customer_name           as "Cliente",
  o.customer_email          as "Email",
  o.customer_phone          as "Telefono",
  o.delivery_method         as "Entrega",
  o.subtotal                as "Subtotal",
  o.discount_total          as "Descuento",
  o.delivery_cost           as "Costo entrega",
  o.total                   as "Total",
  (o.paid_at at time zone 'America/Argentina/Cordoba')::date as "Fecha de pago",
  (select count(*) from public.order_items oi where oi.order_id = o.id) as "Items"
from public.orders o;


create or replace view public.v_sales_export
with (security_invoker = true) as
select
  o.order_number  as "Pedido",
  (o.created_at at time zone 'America/Argentina/Cordoba')::date as "Fecha",
  oi.product_name as "Producto",
  oi.variant_label as "Variante",
  oi.sku          as "SKU",
  oi.quantity     as "Cantidad",
  oi.unit_price   as "Precio unitario",
  oi.discount_amount as "Descuento",
  oi.line_total   as "Total linea",
  oi.promotion_title as "Promocion",
  o.status        as "Estado del pedido"
from public.order_items oi
join public.orders o on o.id = oi.order_id;


create or replace view public.v_stock_export
with (security_invoker = true) as
select
  p.name                    as "Producto",
  public.variant_label(v.id) as "Variante",
  v.sku                     as "SKU",
  c.name                    as "Categoria",
  v.stock                   as "Stock",
  v.reserved                as "Reservado",
  greatest(v.stock - v.reserved, 0) as "Disponible",
  coalesce(v.price_override, p.base_price) as "Precio",
  p.status                  as "Estado"
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.categories c on c.id = p.category_id
where p.deleted_at is null;
