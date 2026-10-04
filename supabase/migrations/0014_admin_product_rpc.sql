-- =============================================================================
-- Alma Tejida · 0014 · Guardado atomico de la estructura de un producto
--
--   El editor manda de una sola vez: caracteristicas, sus valores y las
--   combinaciones que el administrador decidio fabricar. Guardar eso en pasos
--   sueltos dejaria estados imposibles (un valor sin atributo, una variante
--   apuntando a un valor borrado). Aca es todo o nada.
--
--   El STOCK no se toca desde aca: se mueve unicamente por adjust_stock(),
--   para que ningun cambio de inventario ocurra sin su movimiento.
-- =============================================================================

create or replace function public.admin_save_product_structure(
  p_product_id uuid,
  p_payload    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attr          jsonb;
  v_value         jsonb;
  v_variant       jsonb;
  v_attr_id       uuid;
  v_value_id      uuid;
  v_variant_id    uuid;
  v_key_map       jsonb := '{}'::jsonb;   -- clave temporal del editor -> uuid real
  v_resolved      jsonb;                  -- opciones de la variante, ya en uuid
  v_kept_attrs    uuid[] := '{}';
  v_kept_values   uuid[] := '{}';
  v_kept_variants uuid[] := '{}';
  v_has_options   boolean;
  v_position      integer;
  v_opt_key       text;
  v_opt_value     text;
  v_deactivated   integer := 0;
  v_created       integer := 0;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_has_options := jsonb_array_length(coalesce(p_payload -> 'attributes', '[]'::jsonb)) > 0;

  -- ---------------------------------------------------------------------------
  -- 1. CARACTERISTICAS Y SUS VALORES
  -- ---------------------------------------------------------------------------
  v_position := 0;
  for v_attr in select * from jsonb_array_elements(coalesce(p_payload -> 'attributes', '[]'::jsonb))
  loop
    v_attr_id := nullif(v_attr ->> 'id', '')::uuid;

    -- Si no vino id, puede que igual exista: una caracteristica se identifica
    -- por su nombre dentro del producto. "Color" es "Color" aunque el editor
    -- no haya devuelto el id.
    if v_attr_id is null then
      select id into v_attr_id
        from public.product_attributes
       where product_id = p_product_id
         and lower(name) = lower(v_attr ->> 'name');
    end if;

    if v_attr_id is not null then
      update public.product_attributes
         set name = v_attr ->> 'name',
             type = coalesce((v_attr ->> 'type')::public.attribute_type, type),
             position = v_position
       where id = v_attr_id and product_id = p_product_id;
    else
      insert into public.product_attributes (product_id, name, type, position)
      values (
        p_product_id,
        v_attr ->> 'name',
        coalesce((v_attr ->> 'type')::public.attribute_type, 'select'),
        v_position
      )
      returning id into v_attr_id;
    end if;

    v_kept_attrs := v_kept_attrs || v_attr_id;
    v_key_map := v_key_map || jsonb_build_object(v_attr ->> 'key', v_attr_id::text);

    -- valores del atributo
    declare
      v_vpos integer := 0;
    begin
      for v_value in select * from jsonb_array_elements(coalesce(v_attr -> 'values', '[]'::jsonb))
      loop
        v_value_id := nullif(v_value ->> 'id', '')::uuid;

        -- Mismo criterio que con las caracteristicas: dentro de un atributo,
        -- el valor se identifica por su texto.
        if v_value_id is null then
          select id into v_value_id
            from public.product_attribute_values
           where attribute_id = v_attr_id
             and lower(value) = lower(v_value ->> 'value');
        end if;

        if v_value_id is not null then
          update public.product_attribute_values
             set value = v_value ->> 'value',
                 color_hex = nullif(v_value ->> 'color_hex', ''),
                 position = v_vpos
           where id = v_value_id and attribute_id = v_attr_id;
        else
          insert into public.product_attribute_values (attribute_id, value, color_hex, position)
          values (
            v_attr_id,
            v_value ->> 'value',
            nullif(v_value ->> 'color_hex', ''),
            v_vpos
          )
          returning id into v_value_id;
        end if;

        v_kept_values := v_kept_values || v_value_id;
        v_key_map := v_key_map || jsonb_build_object(v_value ->> 'key', v_value_id::text);
        v_vpos := v_vpos + 1;
      end loop;
    end;

    v_position := v_position + 1;
  end loop;

  -- Lo que el administrador saco del editor, se va. El CASCADE limpia los
  -- valores y las combinaciones que colgaban de ahi.
  delete from public.product_attribute_values pav
   using public.product_attributes pa
   where pav.attribute_id = pa.id
     and pa.product_id = p_product_id
     and not (pav.id = any (v_kept_values));

  delete from public.product_attributes
   where product_id = p_product_id
     and not (id = any (v_kept_attrs));

  -- ---------------------------------------------------------------------------
  -- 2. VARIANTES
  -- ---------------------------------------------------------------------------
  v_position := 0;
  for v_variant in select * from jsonb_array_elements(coalesce(p_payload -> 'variants', '[]'::jsonb))
  loop
    -- Las opciones llegan con las claves temporales del editor; aca se
    -- traducen a los uuid reales. Si ya vinieran como uuid, se respetan.
    v_resolved := '{}'::jsonb;
    for v_opt_key, v_opt_value in
      select key, value #>> '{}'
        from jsonb_each(coalesce(v_variant -> 'options', '{}'::jsonb))
    loop
      v_resolved := v_resolved || jsonb_build_object(
        coalesce(v_key_map ->> v_opt_key, v_opt_key),
        coalesce(v_key_map ->> v_opt_value, v_opt_value)
      );
    end loop;

    v_variant_id := nullif(v_variant ->> 'id', '')::uuid;

    -- Sin id, la variante se identifica por su COMBINACION: "Crudo + 1,50x2,00"
    -- es la misma variante aunque el editor no haya devuelto el id. Sin esto,
    -- volver a guardar duplicaria todas las variantes y perderia su stock.
    if v_variant_id is null and v_resolved <> '{}'::jsonb then
      select v.id into v_variant_id
        from public.product_variants v
       where v.product_id = p_product_id
         and (select count(*) from public.variant_option_values vov where vov.variant_id = v.id)
             = (select count(*) from jsonb_object_keys(v_resolved))
         and not exists (
           select 1
             from jsonb_each_text(v_resolved) o
            where not exists (
              select 1 from public.variant_option_values vov
               where vov.variant_id = v.id
                 and vov.attribute_id = o.key::uuid
                 and vov.value_id = o.value::uuid
            )
         )
       limit 1;
    end if;

    -- Producto simple: se reusa la variante por defecto que ya existe
    if v_variant_id is null and v_resolved = '{}'::jsonb and not v_has_options then
      select id into v_variant_id
        from public.product_variants
       where product_id = p_product_id and is_default
       limit 1;
    end if;

    if v_variant_id is not null then
      update public.product_variants
         set sku = nullif(v_variant ->> 'sku', ''),
             price_override = nullif(v_variant ->> 'price_override', '')::numeric,
             low_stock_threshold = nullif(v_variant ->> 'low_stock_threshold', '')::integer,
             is_active = coalesce((v_variant ->> 'is_active')::boolean, true),
             is_default = not v_has_options,
             position = v_position
       where id = v_variant_id and product_id = p_product_id;
    else
      insert into public.product_variants (
        product_id, sku, price_override, low_stock_threshold,
        is_active, is_default, position
      ) values (
        p_product_id,
        nullif(v_variant ->> 'sku', ''),
        nullif(v_variant ->> 'price_override', '')::numeric,
        nullif(v_variant ->> 'low_stock_threshold', '')::integer,
        coalesce((v_variant ->> 'is_active')::boolean, true),
        not v_has_options,
        v_position
      )
      returning id into v_variant_id;

      v_created := v_created + 1;
    end if;

    v_kept_variants := v_kept_variants || v_variant_id;

    -- combinacion de la variante: se reescribe completa
    delete from public.variant_option_values where variant_id = v_variant_id;

    insert into public.variant_option_values (variant_id, attribute_id, value_id)
    select v_variant_id, o.key::uuid, o.value::uuid
      from jsonb_each_text(v_resolved) o;

    v_position := v_position + 1;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 3. LAS QUE YA NO ESTAN
  --
  --    Una variante con historia NO se borra: se desactiva. Borrarla
  --    romperia el rastro de inventario de ventas que si ocurrieron
  --    (punto 101 aplicado al nivel de variante).
  -- ---------------------------------------------------------------------------
  update public.product_variants v
     set is_active = false
   where v.product_id = p_product_id
     and not (v.id = any (v_kept_variants))
     and v.is_active
     and (
       exists (select 1 from public.order_items oi where oi.variant_id = v.id)
       or exists (select 1 from public.inventory_movements im where im.variant_id = v.id)
       or v.stock > 0
     );

  get diagnostics v_deactivated = row_count;

  delete from public.product_variants v
   where v.product_id = p_product_id
     and not (v.id = any (v_kept_variants))
     and v.stock = 0
     and not exists (select 1 from public.order_items oi where oi.variant_id = v.id)
     and not exists (select 1 from public.inventory_movements im where im.variant_id = v.id);

  -- ---------------------------------------------------------------------------
  -- 4. LA GARANTIA D1: todo producto conserva al menos una variante
  -- ---------------------------------------------------------------------------
  if not exists (select 1 from public.product_variants where product_id = p_product_id) then
    insert into public.product_variants (product_id, is_default, is_active, position)
    values (p_product_id, true, true, 0);
    v_created := v_created + 1;
  end if;

  -- Sin caracteristicas hay exactamente una variante por defecto; con
  -- caracteristicas, ninguna lo es.
  if v_has_options then
    update public.product_variants
       set is_default = false
     where product_id = p_product_id and is_default;
  end if;

  perform public.refresh_product_search(p_product_id);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
  values (
    auth.uid(), 'product.structure', 'product', p_product_id,
    jsonb_build_object(
      'attributes', jsonb_array_length(coalesce(p_payload -> 'attributes', '[]'::jsonb)),
      'variants',   jsonb_array_length(coalesce(p_payload -> 'variants', '[]'::jsonb)),
      'created',    v_created,
      'deactivated', v_deactivated
    )
  );

  return jsonb_build_object(
    'product_id',   p_product_id,
    'variants',     (select count(*) from public.product_variants where product_id = p_product_id),
    'created',      v_created,
    'deactivated',  v_deactivated
  );
end;
$$;

grant execute on function public.admin_save_product_structure(uuid, jsonb) to authenticated;
