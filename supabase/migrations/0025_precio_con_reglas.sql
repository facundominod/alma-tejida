-- =============================================================================
-- 0025 - precio_con_reglas(): EL MOTOR
--
-- Devuelve, para una pieza y un escenario de compra concreto, el precio que se
-- cobra, el ahorro, y -si la pieza tiene costo cargado- la ganancia.
--
-- EL ORDEN ES FIJO Y ES ESTE:
--
--   1. effective_price()     precio de lista, oferta del producto y mejor
--                            promocion de PRECIO. Todo lo que ya existia, sin
--                            reimplementar una linea.
--   2. regla por cantidad    la mejor que alcance a esta cantidad. UNA sola:
--                            con "2 o mas" y "3 o mas" cargadas, llevando tres
--                            se aplicarian las dos y el descuento se contaria
--                            dos veces.
--   3. regla por medio       la del medio elegido. Una sola, por lo mismo.
--   4. descuento de contado  el de la tienda o el de la pieza, si el medio no
--                            es tarjeta. Se ACUMULA con la regla del motivo,
--                            que es exactamente lo que se pidio.
--   5. tope                  ninguna combinacion pasa de max_discount_percent.
--   6. redondeo              una sola vez, sobre el precio UNITARIO.
--
-- Los pasos 2 a 4 MULTIPLICAN: cada descuento se calcula sobre lo que quedo
-- del anterior. 25 % y 15 % sumados dan 40 %; multiplicados dan 36,25 %, que
-- es lo que significa "y ademas". Sumar porcentajes deja pasar del 100 % con
-- tres reglas y regalar la pieza.
--
-- POR QUE `p_reglas`
-- El panel tiene que mostrar el precio EN VIVO mientras Silvana escribe reglas
-- que todavia no guardo. La tentacion es escribir una copia del calculo en el
-- navegador; esa copia y esta empiezan iguales y terminan distintas, y el dia
-- que se separan el panel promete un numero y la tienda cobra otro.
--
-- Asi que la vista previa llama a ESTA funcion pasandole las reglas de la
-- pantalla. Null significa "leelas de la base". Mismo codigo, mismo numero.
-- =============================================================================

create or replace function public.precio_con_reglas(
  p_product_id    uuid,
  p_variant_id    uuid    default null,
  p_cantidad      integer default 1,
  p_medio_de_pago text    default 'transferencia',
  p_reglas        jsonb   default null,
  p_promotion_id  uuid    default null
)
returns table (
  list_price        numeric(12,2),
  precio_base       numeric(12,2),
  precio_unitario   numeric(12,2),
  total             numeric(12,2),
  descuento_percent integer,
  ahorro_unitario   numeric(12,2),
  ahorro_total      numeric(12,2),
  costo_unitario    numeric(12,2),
  ganancia_unitaria numeric(12,2),
  ganancia_total    numeric(12,2),
  margen_percent    integer,
  reglas_aplicadas  jsonb,
  tope_alcanzado    boolean
)
language plpgsql
stable
as $$
declare
  v_precio      record;
  v_cantidad    integer := greatest(coalesce(p_cantidad, 1), 1);
  v_medio       text    := coalesce(p_medio_de_pago, 'transferencia');
  v_categoria   uuid;
  v_factor      numeric := 1;
  v_aplicadas   jsonb   := '[]'::jsonb;
  v_por_cantidad jsonb;
  v_por_medio    jsonb;
  v_contado_pct numeric;
  v_tope        numeric;
  v_desc_total  numeric;
  v_tope_tocado boolean := false;
  v_unidad      numeric;
  v_costo       numeric(12,2);
  v_unitario    numeric(12,2);
begin
  -- 1. LO QUE YA EXISTIA.
  select * into v_precio
    from public.effective_price(p_product_id, p_variant_id);

  if v_precio.final_price is null then
    return;
  end if;

  select p.category_id into v_categoria
    from public.products p where p.id = p_product_id;

  select coalesce(s.max_discount_percent, 50) into v_tope
    from public.store_settings s limit 1;
  v_tope := coalesce(v_tope, 50);

  -- LAS REGLAS EN JUEGO, EN UNA SOLA PASADA.
  --
  -- Las que llegaron por parametro -la vista previa del panel- o las guardadas
  -- que alcanzan a esta pieza. Se resuelven las dos que importan en una sola
  -- consulta: esta funcion se llama una vez por fila del catalogo, y una
  -- consulta de mas por fila se nota.
  with reglas as (
    select x->>'kind'                               as kind,
           nullif(x->>'min_quantity', '')::integer  as min_quantity,
           nullif(x->>'payment_method', '')         as payment_method,
           (x->>'discount_percent')::numeric        as discount_percent
      from jsonb_array_elements(coalesce(p_reglas, '[]'::jsonb)) as x
     where p_reglas is not null

    union all

    select pr.kind, pr.min_quantity, pr.payment_method, pr.discount_percent
      from public.promotion_rules pr
      join public.promotions p on p.id = pr.promotion_id
     where p_reglas is null
       and pr.is_active
       and p.is_active
       and (p.starts_at is null or p.starts_at <= now())
       and (p.ends_at   is null or p.ends_at   >= now())
       and (
         (p_promotion_id is not null and pr.promotion_id = p_promotion_id)
         or (
           p_promotion_id is null
           and exists (
             select 1 from public.promotion_targets pt
              where pt.promotion_id = pr.promotion_id
                and (
                  pt.product_id = p_product_id
                  or (v_categoria is not null and pt.category_id = v_categoria)
                )
           )
         )
       )
  )
  select
    -- 2. LA MEJOR REGLA POR CANTIDAD. Una sola: con "2 o mas" y "3 o mas"
    --    cargadas, llevando tres se aplicarian las dos y el descuento se
    --    contaria dos veces.
    (select jsonb_build_object('pct', r.discount_percent, 'min', r.min_quantity)
       from reglas r
      where r.kind = 'cantidad'
        and r.min_quantity is not null
        and v_cantidad >= r.min_quantity
      order by r.discount_percent desc
      limit 1),
    -- 3. LA REGLA DEL MEDIO ELEGIDO. Una sola, por lo mismo.
    (select jsonb_build_object('pct', r.discount_percent, 'medio', r.payment_method)
       from reglas r
      where r.kind = 'medio_de_pago'
        and r.payment_method = v_medio
      order by r.discount_percent desc
      limit 1)
  into v_por_cantidad, v_por_medio;

  if v_por_cantidad is not null then
    v_factor := v_factor * (1 - (v_por_cantidad->>'pct')::numeric / 100.0);
    v_aplicadas := v_aplicadas || jsonb_build_object(
      'motivo', 'Por llevar ' || (v_por_cantidad->>'min') || ' o más',
      'porcentaje', (v_por_cantidad->>'pct')::numeric
    );
  end if;

  if v_por_medio is not null then
    v_factor := v_factor * (1 - (v_por_medio->>'pct')::numeric / 100.0);
    v_aplicadas := v_aplicadas || jsonb_build_object(
      'motivo', 'Pagando con ' || (v_por_medio->>'medio'),
      'porcentaje', (v_por_medio->>'pct')::numeric
    );
  end if;

  -- 4. EL DESCUENTO DE CONTADO DE SIEMPRE, acumulado con el del motivo.
  if v_medio <> 'tarjeta' then
    select coalesce(pr.cash_discount_percent, s.cash_discount_percent, 0)
      into v_contado_pct
      from public.products pr
      left join public.store_settings s on true
     where pr.id = p_product_id
     limit 1;

    if coalesce(v_contado_pct, 0) > 0 then
      v_factor := v_factor * (1 - v_contado_pct / 100.0);
      v_aplicadas := v_aplicadas || jsonb_build_object(
        'motivo', 'Transferencia o efectivo',
        'porcentaje', v_contado_pct
      );
    end if;
  end if;

  -- 5. EL TOPE.
  v_desc_total := (1 - v_factor) * 100;

  if v_desc_total > v_tope then
    v_factor := 1 - v_tope / 100.0;
    v_tope_tocado := true;
  end if;

  -- 6. EL REDONDEO: una sola vez y sobre la UNIDAD.
  --    Redondear el total en vez de la unidad hace que dos unidades den un
  --    numero que no es el doble de lo que dice la linea.
  v_unidad   := case when v_precio.final_price >= 10000 then 100 else 1 end;
  v_unitario := round((v_precio.final_price * v_factor) / v_unidad) * v_unidad;
  v_unitario := least(greatest(v_unitario, 0), v_precio.final_price);

  -- El costo de la combinacion manda sobre el de la pieza: una variante mas
  -- grande cuesta mas de hacer.
  select coalesce(pv.cost, pr.base_cost) into v_costo
    from public.products pr
    left join public.product_variants pv
      on pv.id = p_variant_id and pv.product_id = pr.id
   where pr.id = p_product_id
   limit 1;

  return query select
    v_precio.list_price,
    v_precio.final_price,
    v_unitario,
    (v_unitario * v_cantidad)::numeric(12,2),
    case when v_precio.final_price > 0
         then round((v_precio.final_price - v_unitario) * 100 / v_precio.final_price)::integer
         else 0 end,
    (v_precio.final_price - v_unitario)::numeric(12,2),
    ((v_precio.final_price - v_unitario) * v_cantidad)::numeric(12,2),
    v_costo,
    case when v_costo is not null then (v_unitario - v_costo)::numeric(12,2) end,
    case when v_costo is not null then ((v_unitario - v_costo) * v_cantidad)::numeric(12,2) end,
    case when v_costo is not null and v_unitario > 0
         then round((v_unitario - v_costo) * 100 / v_unitario)::integer end,
    v_aplicadas,
    v_tope_tocado;
end;
$$;

comment on function public.precio_con_reglas(uuid, uuid, integer, text, jsonb, uuid) is
  'UNICA implementacion del precio con reglas acumuladas. El panel le pasa reglas sin guardar en p_reglas; la tienda le pasa null. Misma funcion, mismo numero.';

grant execute on function public.precio_con_reglas(uuid, uuid, integer, text, jsonb, uuid)
  to anon, authenticated;
