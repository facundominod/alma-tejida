-- =============================================================================
-- Alma Tejida · 0008 · Precio centralizado y vistas de lectura
--
--   UNA sola implementacion del precio en todo el sistema (punto 107).
--   El catalogo, la ficha, el carrito y create_order llaman a la MISMA funcion.
--   Es imposible que muestren numeros distintos porque no hay segunda version.
-- =============================================================================

create or replace function public.effective_price(
  p_product_id uuid,
  p_variant_id uuid default null
)
returns table (
  list_price       numeric(12,2),
  final_price      numeric(12,2),
  discount_amount  numeric(12,2),
  discount_percent integer,
  promotion_id     uuid,
  promotion_title  text,
  price_source     text
)
language plpgsql
stable
as $$
declare
  v_category    uuid;
  v_base        numeric(12,2);
  v_sale        numeric(12,2);
  v_sale_from   timestamptz;
  v_sale_to     timestamptz;
  v_override    numeric(12,2);
  v_list        numeric(12,2);
  v_final       numeric(12,2);
  v_source      text := 'base';
  v_promo_id    uuid;
  v_promo_title text;
  v_promo_price numeric(12,2);
  v_now         timestamptz := now();
begin
  select p.category_id, p.base_price, p.sale_price, p.sale_starts_at, p.sale_ends_at
    into v_category, v_base, v_sale, v_sale_from, v_sale_to
    from public.products p
   where p.id = p_product_id
     and p.deleted_at is null;

  if not found then
    return;
  end if;

  -- (1) precio de lista: el override de la variante manda sobre el base
  if p_variant_id is not null then
    select v.price_override into v_override
      from public.product_variants v
     where v.id = p_variant_id
       and v.product_id = p_product_id;
  end if;

  v_list  := round(coalesce(v_override, v_base), 2);
  v_final := v_list;

  -- (2) precio promocional propio del producto, si esta vigente HOY
  if v_sale is not null
     and (v_sale_from is null or v_sale_from <= v_now)
     and (v_sale_to   is null or v_sale_to   >= v_now)
     and v_sale < v_final
  then
    v_final  := round(v_sale, 2);
    v_source := 'product_sale';
  end if;

  -- (3) la mejor promocion vigente que alcance al producto o a su categoria
  select pr.id, pr.title, cand.price
    into v_promo_id, v_promo_title, v_promo_price
    from public.promotions pr
    join public.promotion_targets pt on pt.promotion_id = pr.id
   cross join lateral (
      select round(
        case pr.discount_type
          when 'percent'     then v_list * (1 - pr.discount_value / 100.0)
          when 'fixed_price' then pr.discount_value
          when 'amount_off'  then greatest(v_list - pr.discount_value, 0)
        end, 2)::numeric(12,2) as price
   ) cand
   where pr.is_active
     and (pr.starts_at is null or pr.starts_at <= v_now)
     and (pr.ends_at   is null or pr.ends_at   >= v_now)
     and (
       pt.product_id = p_product_id
       or (v_category is not null and pt.category_id = v_category)
     )
   -- (4) gana la de MAYOR descuento para el cliente. Nunca se acumulan.
   order by cand.price asc
   limit 1;

  if v_promo_price is not null and v_promo_price < v_final then
    v_final  := v_promo_price;
    v_source := 'promotion';
  else
    v_promo_id    := null;
    v_promo_title := null;
  end if;

  v_final := greatest(v_final, 0);

  return query
  select
    v_list,
    v_final,
    round(v_list - v_final, 2)::numeric(12,2),
    case when v_list > 0
         then round((v_list - v_final) * 100 / v_list)::integer
         else 0 end,
    v_promo_id,
    v_promo_title,
    v_source;
end;
$$;

comment on function public.effective_price(uuid, uuid) is
  'UNICA fuente de verdad del precio. Prioridad: override de variante > oferta del producto > mejor promocion vigente.';

grant execute on function public.effective_price(uuid, uuid) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- Etiqueta legible de una variante: "Crudo · 1,50 x 2,00"
-- -----------------------------------------------------------------------------
create or replace function public.variant_label(p_variant_id uuid)
returns text
language sql
stable
as $$
  select nullif(string_agg(pav.value, ' · ' order by pa.position, pav.position), '')
  from public.variant_option_values vov
  join public.product_attributes pa        on pa.id  = vov.attribute_id
  join public.product_attribute_values pav on pav.id = vov.value_id
  where vov.variant_id = p_variant_id;
$$;

grant execute on function public.variant_label(uuid) to anon, authenticated;


-- =============================================================================
-- VISTAS
--
--   security_invoker = true es OBLIGATORIO. Sin el, una vista corre con los
--   permisos de su duena (postgres) y filtraria TODO saltandose RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- v_product_variants - una fila por variante, con precio y disponibilidad
-- -----------------------------------------------------------------------------
create or replace view public.v_product_variants
with (security_invoker = true) as
select
  v.id                                          as variant_id,
  v.product_id,
  v.sku,
  v.stock,
  v.reserved,
  greatest(v.stock - v.reserved, 0)             as available,
  v.is_default,
  v.is_active,
  v.position,
  coalesce(v.low_stock_threshold, p.low_stock_threshold) as low_stock_threshold,
  (greatest(v.stock - v.reserved, 0)
     <= coalesce(v.low_stock_threshold, p.low_stock_threshold)) as is_low_stock,
  lbl.label                                     as variant_label,
  ep.list_price,
  ep.final_price,
  ep.discount_amount,
  ep.discount_percent,
  ep.promotion_id,
  ep.promotion_title,
  ep.price_source
from public.product_variants v
join public.products p on p.id = v.product_id
left join lateral public.effective_price(v.product_id, v.id) ep on true
left join lateral (select public.variant_label(v.id) as label) lbl on true;


-- -----------------------------------------------------------------------------
-- v_catalog_products - una fila por producto, lista para una tarjeta
--   Calcula el precio UNA vez por producto (sobre la variante mas barata),
--   no una vez por variante: el catalogo se mantiene barato.
-- -----------------------------------------------------------------------------
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
  cover.alt          as cover_alt
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

where p.deleted_at is null;

comment on view public.v_catalog_products is
  'Una fila por producto lista para renderizar una tarjeta. Filtrar por status=''published'' en la consulta.';


-- -----------------------------------------------------------------------------
-- Busqueda (punto 32)
--   search_vector se mantiene por trigger (ver 0010) porque incluye datos de
--   otras tablas: nombre de categoria y valores de atributo.
-- -----------------------------------------------------------------------------
create or replace function public.search_products(
  p_query text,
  p_limit integer default 24
)
returns setof public.v_catalog_products
language sql
stable
as $$
  select cp.*
  from public.v_catalog_products cp
  join public.products p on p.id = cp.id
  where cp.status = 'published'
    and (
      p.search_vector @@ websearch_to_tsquery('spanish', public.at_unaccent(p_query))
      or public.at_unaccent(p.name) ilike '%' || public.at_unaccent(p_query) || '%'
    )
  order by
    ts_rank(p.search_vector, websearch_to_tsquery('spanish', public.at_unaccent(p_query))) desc,
    extensions.similarity(public.at_unaccent(p.name), public.at_unaccent(p_query)) desc,
    p.published_at desc nulls last
  limit least(coalesce(p_limit, 24), 60);
$$;

grant execute on function public.search_products(text, integer) to anon, authenticated;
