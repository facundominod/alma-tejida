-- =============================================================================
-- 0016 - LAS TARJETAS TRAEN MAS DE UNA FOTO
--
-- `v_catalog_products` devolvia una sola imagen por producto: la portada. Para
-- que la tarjeta pueda ir mostrando las fotos de una pieza -que es como se
-- mira algo tejido, girandolo- hacen falta las primeras.
--
-- Tres y no todas: con cuatro columnas de productos en pantalla, cada foto de
-- mas es una descarga de mas en un celular. Tres alcanzan para el derecho, el
-- reves y un detalle.
--
-- La columna nueva va al FINAL del select. Eso permite `create or replace
-- view` en lugar de `drop view ... cascade`, que se llevaria puesta a
-- search_products() y obligaria a recrearla: dos copias de la misma
-- definicion es exactamente como se desincronizan las cosas.
--
-- El cuerpo de la vista es el de 0008 sin tocar, `security_invoker` incluido.
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
  -- "3 colores" en la tarjeta, sin saturarla (punto 30)
  opts.option_summary,

  cover.storage_path as cover_path,
  cover.thumb_path   as cover_thumb,
  cover.blur_data    as cover_blur,
  cover.alt          as cover_alt,

  -- Las primeras tres imagenes, portada incluida y en el mismo orden que
  -- la ficha. Va AL FINAL de la lista de columnas a proposito: ver arriba.
  galeria.gallery
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

where p.deleted_at is null;

comment on column public.v_catalog_products.gallery is
  'Las primeras 3 imagenes, portada incluida. Para que la tarjeta las vaya mostrando.';
