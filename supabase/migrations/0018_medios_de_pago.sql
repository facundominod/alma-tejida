-- =============================================================================
-- 0018 - MEDIOS DE PAGO Y DESCUENTO POR CONTADO
--
-- Como se vende de verdad en una tienda asi:
--
--   El PRECIO DE LISTA es el de tarjeta, hasta N cuotas sin interes. Es el que
--   se muestra grande, porque es el que la mayoria va a pagar.
--
--   Pagando por TRANSFERENCIA O EFECTIVO hay un descuento -20 % por defecto-
--   porque no hay comision de tarjeta ni plata inmovilizada un mes.
--
-- Dos decisiones que vale la pena dejar escritas:
--
-- 1. SE GUARDA EL PORCENTAJE, NO EL PRECIO CON DESCUENTO.
--    Si se guardaran los dos precios, subir el de lista dejaria el de contado
--    viejo y nadie se enteraria hasta que alguien pague de menos. Con el
--    porcentaje, el precio de contado se recalcula solo, siempre. El panel
--    deja escribir cualquiera de los dos y convierte: eso es comodidad de la
--    pantalla, no una segunda fuente de verdad.
--
-- 2. NULO EN LA PIEZA SIGNIFICA "LO QUE DIGA LA TIENDA".
--    Asi cambiar el descuento general es un solo numero, y la pieza que
--    necesita otro lo dice explicitamente. Cero es un valor valido y distinto
--    de nulo: es "esta pieza no tiene descuento por contado".
-- =============================================================================

alter table public.store_settings
  add column if not exists cash_discount_percent numeric(5,2) not null default 20;

alter table public.store_settings
  add column if not exists card_installments integer not null default 3;

comment on column public.store_settings.cash_discount_percent is
  'Descuento por transferencia o efectivo, en %. Lo usan las piezas que no definen el suyo.';
comment on column public.store_settings.card_installments is
  'Cuotas sin interes incluidas en el precio de lista.';

alter table public.products
  add column if not exists cash_discount_percent numeric(5,2);

comment on column public.products.cash_discount_percent is
  'Descuento por contado de ESTA pieza. Nulo = el de la tienda. Cero = sin descuento.';

-- Un descuento del 100 % seria regalar la pieza, y casi siempre es un error de
-- tipeo. Se corta en la base, no en el formulario: el formulario es una de las
-- varias puertas a estas columnas.
alter table public.store_settings
  drop constraint if exists store_settings_cash_discount_rango;
alter table public.store_settings
  add constraint store_settings_cash_discount_rango
  check (cash_discount_percent >= 0 and cash_discount_percent < 100);

alter table public.store_settings
  drop constraint if exists store_settings_cuotas_rango;
alter table public.store_settings
  add constraint store_settings_cuotas_rango
  check (card_installments between 1 and 24);

alter table public.products
  drop constraint if exists products_cash_discount_rango;
alter table public.products
  add constraint products_cash_discount_rango
  check (cash_discount_percent is null
         or (cash_discount_percent >= 0 and cash_discount_percent < 100));


-- =============================================================================
-- LA VISTA DEL CATALOGO ENTREGA EL DESCUENTO YA RESUELTO
--
-- Para que ninguna pantalla tenga que acordarse de la regla "si es nulo, usa
-- el de la tienda". Esa clase de regla repetida en cinco lugares es la que
-- termina aplicandose distinto en la tarjeta que en la ficha.
--
-- El cuerpo es el de 0016 sin tocar y la columna nueva va AL FINAL, por lo
-- mismo que explica esa migracion: permite `create or replace view` en lugar
-- de `drop view ... cascade`, que se llevaria puesta a search_products().
--
-- El join a store_settings es LEFT y no CROSS a proposito. Con cross join, el
-- dia que esa fila no estuviera el catalogo entero devolveria cero piezas: la
-- tienda vacia por un dato de configuracion. Con left join y coalesce, lo peor
-- que pasa es que no haya descuento por contado.
-- =============================================================================

create or replace view public.v_catalog_products
with (security_invoker = true) as
select
  p.id,
  p.slug,
  p.name,
  p.short_description,
  p.status,
  p.category_id,
  c.name  as category_name,
  c.slug  as category_slug,
  p.availability_mode,
  p.lead_time_days,
  p.stock_display,
  p.low_stock_threshold,
  p.show_when_out_of_stock,
  p.is_featured,
  p.featured_position,
  p.rating_avg,
  p.rating_count,
  p.published_at,
  p.created_at,

  cheap.variant_id       as price_variant_id,
  ep.list_price,
  ep.final_price,
  ep.discount_amount,
  ep.discount_percent,
  ep.promotion_id,
  ep.promotion_title,
  ep.price_source,

  agg.variant_count,
  agg.available_total,
  (agg.max_list_price > agg.min_list_price) as has_price_range,
  opts.option_summary,

  cover.storage_path as cover_path,
  cover.thumb_path   as cover_thumb,
  cover.blur_data    as cover_blur,
  cover.alt          as cover_alt,

  galeria.gallery,

  -- Columnas nuevas de 0018, al final de la lista.
  coalesce(p.cash_discount_percent, ajustes.cash_discount_percent, 0)
    as cash_discount_percent,
  coalesce(ajustes.card_installments, 1) as card_installments
from public.products p
left join public.categories c on c.id = p.category_id

cross join lateral (
  select
    count(*)::int                                           as variant_count,
    coalesce(sum(greatest(v.stock - v.reserved, 0)), 0)::int as available_total,
    min(coalesce(v.price_override, p.base_price))           as min_list_price,
    max(coalesce(v.price_override, p.base_price))           as max_list_price
  from public.product_variants v
  where v.product_id = p.id and v.is_active
) agg

left join lateral (
  select v.id as variant_id
  from public.product_variants v
  where v.product_id = p.id and v.is_active
  order by coalesce(v.price_override, p.base_price) asc, v.position asc
  limit 1
) cheap on true

left join lateral public.effective_price(p.id, cheap.variant_id) ep on true

left join lateral (
  select jsonb_agg(jsonb_build_object('name', a.name, 'count', a.n)
                   order by a.position) as option_summary
  from (
    select pa.name, pa.position, count(pav.id) as n
    from public.product_attributes pa
    join public.product_attribute_values pav on pav.attribute_id = pa.id
    where pa.product_id = p.id
    group by pa.name, pa.position
  ) a
) opts on true

left join lateral (
  select m.storage_path, m.thumb_path, m.blur_data, m.alt
  from public.product_media m
  where m.product_id = p.id and m.type = 'image'
  order by m.is_cover desc, m.position asc
  limit 1
) cover on true

left join lateral (
  select jsonb_agg(
           jsonb_build_object(
             'path',  g.storage_path,
             'thumb', g.thumb_path,
             'blur',  g.blur_data,
             'alt',   g.alt
           )
           order by g.orden
         ) as gallery
  from (
    select m.storage_path, m.thumb_path, m.blur_data, m.alt,
           row_number() over (order by m.is_cover desc, m.position asc) as orden
    from public.product_media m
    where m.product_id = p.id and m.type = 'image'
    order by m.is_cover desc, m.position asc
    limit 3
  ) g
) galeria on true

left join lateral (
  select s.cash_discount_percent, s.card_installments
  from public.store_settings s
  limit 1
) ajustes on true

where p.deleted_at is null;

comment on column public.v_catalog_products.cash_discount_percent is
  'Descuento por transferencia o efectivo ya resuelto: el de la pieza, o el de la tienda.';
comment on column public.v_catalog_products.card_installments is
  'Cuotas sin interes incluidas en el precio de lista.';
