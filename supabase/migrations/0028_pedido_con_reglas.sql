-- =============================================================================
-- 0028 - EL PEDIDO SE COBRA CON LAS REGLAS DE LA OFERTA
--
-- Hasta aca el motor calculaba y el panel lo mostraba, pero la tienda seguia
-- cobrando como antes: `create_order` llamaba a `effective_price()`, que no
-- sabe nada de cantidades ni de medios de pago.
--
-- POR QUE SE LE PREGUNTA DOS VECES AL MOTOR
-- Porque la linea del pedido guarda el precio de TARJETA en `unit_price` y el
-- descuento de contado aparte, como porcentaje. Meter todo en un solo numero
-- haria que el calculo del pedido le aplicara el porcentaje otra vez y
-- descontara dos veces.
--
-- Asi que: una llamada con 'tarjeta' da el precio con las reglas por cantidad,
-- y otra con el medio elegido da cuanto baja por pagar asi. La diferencia
-- entre ambos es el porcentaje efectivo que se congela.
--
-- SI EL MOTOR NO CONTESTA, EL PEDIDO SE CREA IGUAL
-- Con el precio de siempre. Un pedido que no se puede confirmar es peor que
-- uno sin el descuento nuevo, y esto corre en el unico camino donde hay plata
-- comprometida.
--
-- El cuerpo es el de 0019 con cuatro cambios, extraido mecanicamente.
-- =============================================================================

create or replace function public.create_order(
  p_cart_id          uuid,
  p_idempotency_key  text,
  p_customer_name    text,
  p_customer_email   text,
  p_customer_phone   text,
  p_anon_token       text    default null,
  p_delivery_method  text    default null,
  p_shipping_address jsonb   default null,
  p_customer_note    text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cart          public.carts;
  v_order_id      uuid;
  v_order_number  text;
  v_access_token  uuid;
  v_item          record;
  v_lock          record;
  v_price         record;
  v_reserve_qty   integer;
  v_line_total    numeric(12,2);
  v_cash_pct      numeric(5,2);
  v_con_reglas    record;
  v_contado       record;
  v_subtotal      numeric(12,2) := 0;
  v_discount      numeric(12,2) := 0;
  v_delivery_cost numeric(12,2) := 0;
  v_item_count    integer := 0;
  v_existing      record;
  v_cover         text;
  v_label         text;
begin
  -- ---------------------------------------------------------------------------
  -- 1. IDEMPOTENCIA (punto 163)
  --    El doble clic no crea dos pedidos. La garantia es esta consulta mas la
  --    constraint UNIQUE, no un boton deshabilitado en el navegador.
  -- ---------------------------------------------------------------------------
  select o.id, o.order_number, o.access_token, o.total, o.status
    into v_existing
    from public.orders o
   where o.idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'order_id',     v_existing.id,
      'order_number', v_existing.order_number,
      'access_token', v_existing.access_token,
      'total',        v_existing.total,
      'status',       v_existing.status,
      'duplicate',    true
    );
  end if;

  -- ---------------------------------------------------------------------------
  -- 2. CARRITO
  -- ---------------------------------------------------------------------------
  select * into v_cart from public.carts where id = p_cart_id for update;

  if not found then
    raise exception 'CART_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_cart.status <> 'active' then
    raise exception 'CART_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  -- Quien pide tiene que ser el dueno del carrito
  if v_cart.user_id is not null then
    if v_cart.user_id is distinct from auth.uid() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  else
    if p_anon_token is null or v_cart.anon_token is distinct from p_anon_token then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  select count(*) into v_item_count from public.cart_items where cart_id = p_cart_id;
  if v_item_count = 0 then
    raise exception 'CART_EMPTY' using errcode = 'P0001';
  end if;

  -- ---------------------------------------------------------------------------
  -- 3. BLOQUEO DE VARIANTES, ORDENADO POR ID
  --    El orden es lo que evita deadlocks cuando dos pedidos comparten dos
  --    productos en orden inverso.
  -- ---------------------------------------------------------------------------
  for v_lock in
    select v.id
      from public.product_variants v
     where v.id in (
       select ci.variant_id from public.cart_items ci where ci.cart_id = p_cart_id
     )
     order by v.id
  loop
    -- fila por fila, en orden estricto de id: asi el orden de bloqueo esta
    -- garantizado por el codigo y no depende del plan que elija el planificador
    perform 1 from public.product_variants where id = v_lock.id for update;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 4. COSTO DE ENTREGA (desde la configuracion, no desde el navegador)
  -- ---------------------------------------------------------------------------
  if p_delivery_method is not null then
    select coalesce((dm ->> 'price')::numeric, 0)
      into v_delivery_cost
      from public.store_settings s,
           lateral jsonb_array_elements(s.delivery_methods) dm
     where s.id = 1
       and dm ->> 'key' = p_delivery_method
       and coalesce((dm ->> 'is_active')::boolean, true)
     limit 1;

    v_delivery_cost := coalesce(v_delivery_cost, 0);
  end if;

  -- ---------------------------------------------------------------------------
  -- 5. CABECERA DEL PEDIDO (totales en 0; se completan al final)
  -- ---------------------------------------------------------------------------
  insert into public.orders (
    user_id, customer_name, customer_email, customer_phone,
    delivery_method, shipping_address, customer_note,
    idempotency_key, delivery_cost, status
  ) values (
    v_cart.user_id,
    trim(p_customer_name),
    lower(trim(p_customer_email)),
    trim(p_customer_phone),
    p_delivery_method,
    p_shipping_address,
    nullif(trim(coalesce(p_customer_note, '')), ''),
    p_idempotency_key,
    v_delivery_cost,
    'pending'
  )
  returning id, order_number, access_token
       into v_order_id, v_order_number, v_access_token;

  -- ---------------------------------------------------------------------------
  -- 6. ITEMS: revalidar, poner precio del SERVIDOR, congelar snapshot, reservar
  -- ---------------------------------------------------------------------------
  for v_item in
    select ci.variant_id,
           ci.quantity,
           v.product_id,
           v.stock,
           v.reserved,
           v.sku,
           v.is_active,
           p.name              as product_name,
           p.slug              as product_slug,
           p.status            as product_status,
           p.availability_mode,
           p.deleted_at,
           ci.payment_method
      from public.cart_items ci
      join public.product_variants v on v.id = ci.variant_id
      join public.products p         on p.id = v.product_id
     where ci.cart_id = p_cart_id
     order by ci.variant_id
  loop
    -- 6a. el producto sigue estando a la venta?
    if v_item.product_status <> 'published'
       or v_item.deleted_at is not null
       or not v_item.is_active then
      raise exception 'PRODUCT_UNAVAILABLE:%', v_item.variant_id using errcode = 'P0001';
    end if;

    -- 6b. hay stock? (un producto a pedido puede venderse sin el)
    if v_item.availability_mode <> 'made_to_order'
       and (v_item.stock - v_item.reserved) < v_item.quantity then
      raise exception 'OUT_OF_STOCK:%', v_item.variant_id using errcode = 'P0001';
    end if;

    -- 6c. PRECIO DEL SERVIDOR. El navegador no manda precio: ni siquiera
    --     existe el campo. Aca no hay nada que verificar porque no hay
    --     nada que el cliente haya podido escribir (punto 108).
    select * into v_price
      from public.effective_price(v_item.product_id, v_item.variant_id);

    -- EL MOTOR DE REGLAS, CON LA CANTIDAD DE ESTA LINEA.
    --
    -- Se le pregunta DOS veces, y no es un descuido:
    --
    --   · con 'tarjeta' para saber el precio con las reglas por CANTIDAD pero
    --     sin ningun descuento por medio de pago;
    --   · con el medio que eligio la clienta, para saber cuanto baja por pagar
    --     asi.
    --
    -- Hace falta separarlos porque `unit_price` guarda el precio de tarjeta y
    -- el descuento de contado viaja aparte, como porcentaje. Si se guardara un
    -- solo numero con todo adentro, el calculo del pedido volveria a aplicarle
    -- el porcentaje y descontaria dos veces.
    select * into v_con_reglas
      from public.precio_con_reglas(
        v_item.product_id, v_item.variant_id, v_item.quantity, 'tarjeta'
      );

    select * into v_contado
      from public.precio_con_reglas(
        v_item.product_id, v_item.variant_id, v_item.quantity,
        coalesce(v_item.payment_method, 'transferencia')
      );

    if v_price.final_price is null then
      raise exception 'PRICE_UNAVAILABLE:%', v_item.variant_id using errcode = 'P0001';
    end if;

    -- Si el motor no contesta -no deberia- se sigue con el precio de siempre.
    -- Un pedido que no se puede crear es peor que uno sin el descuento nuevo.
    if v_con_reglas.precio_unitario is not null then
      v_price.final_price := v_con_reglas.precio_unitario;
    end if;

    v_line_total := round(v_price.final_price * v_item.quantity, 2);
    v_subtotal   := v_subtotal + round(v_price.list_price * v_item.quantity, 2);
    v_discount   := v_discount
                  + round((v_price.list_price - v_price.final_price) * v_item.quantity, 2);

    -- 6d. cuanto se reserva realmente del inventario fisico
    v_reserve_qty := least(
      v_item.quantity,
      greatest(v_item.stock - v_item.reserved, 0)
    );

    -- 6e. etiqueta e imagen, congeladas
    v_label := public.variant_label(v_item.variant_id);

    -- El descuento por contado se CONGELA, igual que el precio y el costo. Si
    -- se recalculara al leer el pedido, cambiar el descuento general movería
    -- lo que hay que cobrar en pedidos que ya estan hechos.
    -- El porcentaje que se congela es el EFECTIVO, no el de la tienda: si el
    -- motivo vigente daba un descuento por pagar en efectivo distinto del
    -- habitual, es ese el que corresponde guardar. Sale de comparar los dos
    -- precios que devolvio el motor.
    if v_contado.precio_unitario is not null and v_price.final_price > 0 then
      v_cash_pct := round(
        (v_price.final_price - v_contado.precio_unitario) * 100 / v_price.final_price, 2
      );
      v_cash_pct := greatest(least(v_cash_pct, 99.99), 0);
    else
      select coalesce(p.cash_discount_percent, s.cash_discount_percent, 0)
        into v_cash_pct
        from public.products p
        left join public.store_settings s on true
       where p.id = v_item.product_id
       limit 1;
    end if;

    select coalesce(m.thumb_path, m.storage_path) into v_cover
      from public.product_media m
     where m.product_id = v_item.product_id
       and m.type = 'image'
     order by (m.variant_id = v_item.variant_id) desc, m.is_cover desc, m.position asc
     limit 1;

    -- 6f. EL SNAPSHOT (punto 47)
    insert into public.order_items (
      order_id, product_id, variant_id,
      product_name, product_slug, variant_label, sku, image_url,
      unit_price, unit_compare_price, discount_amount,
      quantity, reserved_quantity, line_total,
      promotion_id, promotion_title,
      payment_method, cash_discount_percent
    ) values (
      v_order_id, v_item.product_id, v_item.variant_id,
      v_item.product_name, v_item.product_slug, v_label, v_item.sku, v_cover,
      v_price.final_price,
      case when v_price.discount_amount > 0 then v_price.list_price end,
      round(v_price.discount_amount * v_item.quantity, 2),
      v_item.quantity, v_reserve_qty, v_line_total,
      v_price.promotion_id, v_price.promotion_title,
      coalesce(v_item.payment_method, 'transferencia'), v_cash_pct
    );

    -- 6g. RESERVAR (no descontar: el stock fisico baja recien al cobrar)
    if v_reserve_qty > 0 then
      perform public.apply_stock_movement(
        v_item.variant_id, 'reserve', 0, v_reserve_qty,
        v_order_id, 'Reserva por pedido ' || v_order_number, v_cart.user_id
      );
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 7. TOTALES
  -- ---------------------------------------------------------------------------
  update public.orders
     set subtotal       = v_subtotal,
         discount_total = v_discount,
         total          = greatest(v_subtotal - v_discount, 0) + v_delivery_cost
   where id = v_order_id;

  -- ---------------------------------------------------------------------------
  -- 8. HISTORIAL
  -- ---------------------------------------------------------------------------
  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (v_order_id, null, 'pending', v_cart.user_id, 'Pedido creado');

  -- ---------------------------------------------------------------------------
  -- 9. NOTIFICACION AL ADMIN - UNA sola por pedido (punto 99)
  -- ---------------------------------------------------------------------------
  insert into public.notifications (
    audience, type, title, body, link, entity_type, entity_id, group_key
  ) values (
    'admin',
    'order_created',
    'Nuevo pedido ' || v_order_number,
    trim(p_customer_name) || ' · ' || v_item_count || ' producto' ||
      case when v_item_count = 1 then '' else 's' end,
    '/admin/pedidos/' || v_order_id::text,
    'order',
    v_order_id,
    -- la clave identifica el EVENTO, no solo el pedido: creacion y cancelacion
    -- son dos avisos distintos. La agrupacion visual por pedido la hace la UI.
    'order:' || v_order_id::text || ':created'
  );

  -- ---------------------------------------------------------------------------
  -- 10. EL CARRITO YA CUMPLIO
  -- ---------------------------------------------------------------------------
  update public.carts set status = 'converted' where id = p_cart_id;

  return jsonb_build_object(
    'order_id',     v_order_id,
    'order_number', v_order_number,
    'access_token', v_access_token,
    'total',        greatest(v_subtotal - v_discount, 0) + v_delivery_cost,
    'status',       'pending',
    'duplicate',    false
  );
end;
$$;
