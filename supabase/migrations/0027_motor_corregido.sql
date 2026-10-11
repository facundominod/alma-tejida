-- =============================================================================
-- 0027 - EL MOTOR, CON LOS TRES AGUJEROS TAPADOS
--
-- La version de 0025 tenia tres formas de cobrar mal. Ninguna llego a la
-- tienda -nada estaba conectado- pero las tres estaban escritas.
--
-- 1. EL DESCUENTO DE CONTADO SE ACUMULABA SIEMPRE.
--    Poner "15 % en efectivo" dentro de un motivo daba 20 % x 15 % = 32 %.
--    Lo que casi siempre se quiere decir es 15 EN LUGAR de 20. Ahora cada
--    regla de medio de pago dice cual de las dos cosas es, y por defecto
--    REEMPLAZA. Acumular hay que pedirlo.
--
-- 2. MEZCLABA REGLAS DE MOTIVOS DISTINTOS.
--    Tomaba la mejor regla por cantidad y la mejor por medio de pago entre
--    TODAS las promociones vigentes, asi que podia combinar la cantidad del
--    Dia de la Madre con el medio de pago de otra campania. Eso no es ninguna
--    de las dos ofertas: es una tercera que nadie armo.
--
--    Ahora gana UN motivo entero. Y se compara corriendo la cuenta COMPLETA
--    de cada uno con la cantidad y el medio reales, no por el porcentaje mas
--    alto: un motivo con 10 % plano mas 25 % por cantidad le gana a otro con
--    30 % plano, y comparando porcentajes sueltos se elegiria el equivocado.
--
-- 3. UNA REGLA DE PAGO LE SUBIA EL PRECIO A UNA PIEZA ANCLADA EN CONTADO.
--    Si Silvana fija "este respaldo lo doy a $180.000 por transferencia", ese
--    numero es el piso que ella decidio. Una promocion del 15 % en efectivo lo
--    tomaba como si el ancla fuera el precio de lista y el contado terminaba
--    MAS CARO. Las piezas con price_basis = 'contado' quedan afuera de las
--    reglas de medio de pago.
-- =============================================================================

alter table public.promotion_rules
  add column if not exists payment_mode text not null default 'reemplaza';

alter table public.promotion_rules
  drop constraint if exists promotion_rules_payment_mode_valido;
alter table public.promotion_rules
  add constraint promotion_rules_payment_mode_valido
  check (payment_mode in ('reemplaza', 'ademas'));

comment on column public.promotion_rules.payment_mode is
  '"reemplaza": en lugar del descuento de contado habitual. "ademas": encima de el. Por defecto reemplaza.';


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
  v_ancla       text;
  v_contado_pct numeric;
  v_tope        numeric;
  v_motivo      record;
  v_cant        record;
  v_pago        record;
  -- Banderas aparte y no el propio record: en plpgsql, preguntarle "is null" a
  -- un record que nunca se asigno levanta "record is not assigned yet". Pasaba
  -- con las piezas ancladas en contado, que se saltean el bloque entero.
  v_hubo_pago   boolean;
  v_modo_pago   text;
  v_factor      numeric;
  v_aplicadas   jsonb;
  v_mejor_f     numeric := 1;
  v_mejor_a     jsonb   := '[]'::jsonb;
  v_desc_total  numeric;
  v_tope_tocado boolean := false;
  v_unidad      numeric;
  v_costo       numeric(12,2);
  v_unitario    numeric(12,2);
begin
  select * into v_precio
    from public.effective_price(p_product_id, p_variant_id);

  if v_precio.final_price is null then
    return;
  end if;

  select p.category_id, p.price_basis,
         coalesce(p.cash_discount_percent, s.cash_discount_percent, 0)
    into v_categoria, v_ancla, v_contado_pct
    from public.products p
    left join public.store_settings s on true
   where p.id = p_product_id;

  select coalesce(s.max_discount_percent, 50) into v_tope
    from public.store_settings s limit 1;
  v_tope := coalesce(v_tope, 50);

  -- El descuento de contado habitual, si corresponde. Es el punto de partida:
  -- un motivo tiene que MEJORARLO para ganar.
  if v_medio = 'tarjeta' or coalesce(v_contado_pct, 0) <= 0 then
    v_contado_pct := 0;
  end if;

  v_mejor_f := 1 - v_contado_pct / 100.0;
  if v_contado_pct > 0 then
    v_mejor_a := jsonb_build_array(jsonb_build_object(
      'motivo', 'Transferencia o efectivo', 'porcentaje', v_contado_pct
    ));
  end if;

  -- UN MOTIVO A LA VEZ, Y GANA EL QUE DEJE EL PRECIO MAS BAJO.
  -- La vista previa del panel manda un solo juego de reglas en p_reglas; la
  -- tienda recorre los motivos vigentes que alcanzan a esta pieza.
  for v_motivo in
    select null::uuid as id
     where p_reglas is not null
    union all
    select distinct pr.promotion_id
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
  loop
    v_factor    := 1;
    v_aplicadas := '[]'::jsonb;
    v_hubo_pago := false;
    v_modo_pago := 'reemplaza';

    -- La mejor regla por cantidad de ESTE motivo. Una sola: con "2 o mas" y
    -- "3 o mas" cargadas, llevando tres se aplicarian las dos.
    select r.discount_percent, r.min_quantity into v_cant
      from (
        select (x->>'discount_percent')::numeric as discount_percent,
               nullif(x->>'min_quantity','')::integer as min_quantity,
               x->>'kind' as kind
          from jsonb_array_elements(coalesce(p_reglas, '[]'::jsonb)) as x
         where p_reglas is not null
        union all
        select pr.discount_percent, pr.min_quantity, pr.kind
          from public.promotion_rules pr
         where p_reglas is null and pr.is_active and pr.promotion_id = v_motivo.id
      ) r
     where r.kind = 'cantidad'
       and r.min_quantity is not null
       and v_cantidad >= r.min_quantity
     order by r.discount_percent desc
     limit 1;

    if found then
      v_factor := v_factor * (1 - v_cant.discount_percent / 100.0);
      v_aplicadas := v_aplicadas || jsonb_build_object(
        'motivo', 'Por llevar ' || v_cant.min_quantity || ' o más',
        'porcentaje', v_cant.discount_percent
      );
    end if;

    -- La regla del medio elegido.
    --
    -- Las piezas ancladas en contado quedan afuera: el precio de contado lo
    -- fijo ella a mano y una regla de pago lo SUBIRIA, porque el calculo
    -- trataria ese numero como si fuera el de lista.
    if v_ancla is distinct from 'contado' then
      select r.discount_percent, r.payment_method, r.payment_mode into v_pago
        from (
          select (x->>'discount_percent')::numeric as discount_percent,
                 nullif(x->>'payment_method','') as payment_method,
                 coalesce(nullif(x->>'payment_mode',''), 'reemplaza') as payment_mode,
                 x->>'kind' as kind
            from jsonb_array_elements(coalesce(p_reglas, '[]'::jsonb)) as x
           where p_reglas is not null
          union all
          select pr.discount_percent, pr.payment_method, pr.payment_mode, pr.kind
            from public.promotion_rules pr
           where p_reglas is null and pr.is_active and pr.promotion_id = v_motivo.id
        ) r
       where r.kind = 'medio_de_pago'
         and r.payment_method = v_medio
       order by r.discount_percent desc
       limit 1;

      if found then
        v_hubo_pago := true;
        v_modo_pago := coalesce(v_pago.payment_mode, 'reemplaza');
        v_factor := v_factor * (1 - v_pago.discount_percent / 100.0);
        v_aplicadas := v_aplicadas || jsonb_build_object(
          'motivo', 'Pagando con ' || v_pago.payment_method,
          'porcentaje', v_pago.discount_percent
        );
      end if;
    end if;

    -- El de contado habitual, salvo que la regla del motivo lo reemplace.
    if v_contado_pct > 0 and (not v_hubo_pago or v_modo_pago = 'ademas') then
      v_factor := v_factor * (1 - v_contado_pct / 100.0);
      v_aplicadas := v_aplicadas || jsonb_build_object(
        'motivo', 'Transferencia o efectivo', 'porcentaje', v_contado_pct
      );
    end if;

    if v_factor < v_mejor_f then
      v_mejor_f := v_factor;
      v_mejor_a := v_aplicadas;
    end if;
  end loop;

  -- El tope. Tres reglas acumuladas pueden dejar la pieza en la mitad sin que
  -- nadie lo haya decidido.
  v_desc_total := (1 - v_mejor_f) * 100;
  if v_desc_total > v_tope then
    v_mejor_f := 1 - v_tope / 100.0;
    v_tope_tocado := true;
  end if;

  -- Un solo redondeo, y sobre la UNIDAD: redondear el total hace que dos
  -- unidades den un numero que no es el doble de lo que dice la linea.
  v_unidad   := case when v_precio.final_price >= 10000 then 100 else 1 end;
  v_unitario := round((v_precio.final_price * v_mejor_f) / v_unidad) * v_unidad;
  v_unitario := least(greatest(v_unitario, 0), v_precio.final_price);

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
    v_mejor_a,
    v_tope_tocado;
end;
$$;

comment on function public.precio_con_reglas(uuid, uuid, integer, text, jsonb, uuid) is
  'UNICA implementacion del precio con reglas. Gana UN motivo, comparado corriendo la cuenta completa de cada uno.';

grant execute on function public.precio_con_reglas(uuid, uuid, integer, text, jsonb, uuid)
  to anon, authenticated;
