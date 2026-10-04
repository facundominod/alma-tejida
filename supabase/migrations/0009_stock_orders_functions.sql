-- =============================================================================
-- Alma Tejida · 0009 · Stock y pedidos: el nucleo transaccional
--
--   Todo lo que toca inventario o dinero vive aqui, en SQL, porque necesita
--   transacciones reales. Si el paso 12 falla, PostgreSQL revierte los 11
--   anteriores. No existe el estado "stock reservado pero pedido inexistente".
-- =============================================================================

-- Etiqueta en espanol del estado, usada en notificaciones generadas por la base.
create or replace function public.order_status_label(p_status public.order_status)
returns text
language sql
immutable
as $$
  select case p_status
    when 'pending'          then 'Recibimos tu pedido'
    when 'contacted'        then 'Te contactamos'
    when 'awaiting_payment' then 'Esperando tu transferencia'
    when 'paid'             then 'Confirmamos tu pago'
    when 'preparing'        then 'Estamos preparando tu pedido'
    when 'delivered'        then 'Tu pedido fue entregado'
    when 'cancelled'        then 'Tu pedido fue cancelado'
  end;
$$;

grant execute on function public.order_status_label(public.order_status) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- apply_stock_movement - EL UNICO camino por el que el stock se mueve
--   Interna: revocada de anon/authenticated. Solo la llaman las funciones
--   SECURITY DEFINER de abajo.
-- -----------------------------------------------------------------------------
create or replace function public.apply_stock_movement(
  p_variant_id     uuid,
  p_type           public.movement_type,
  p_stock_delta    integer,
  p_reserved_delta integer,
  p_order_id       uuid default null,
  p_note           text default null,
  p_actor          uuid default null
)
returns public.inventory_movements
language plpgsql
as $$
declare
  v_stock    integer;
  v_reserved integer;
  v_row      public.inventory_movements;
begin
  if p_stock_delta = 0 and p_reserved_delta = 0 then
    raise exception 'NO_OP_MOVEMENT' using errcode = 'P0001';
  end if;

  update public.product_variants
     set stock    = stock + p_stock_delta,
         reserved = reserved + p_reserved_delta
   where id = p_variant_id
  returning stock, reserved into v_stock, v_reserved;

  if not found then
    raise exception 'VARIANT_NOT_FOUND:%', p_variant_id using errcode = 'P0001';
  end if;

  -- Las constraints stock >= 0, reserved >= 0 y reserved <= stock son la
  -- ultima linea de defensa: si algo las viola, la transaccion entera cae.

  insert into public.inventory_movements (
    variant_id, movement_type, stock_delta, reserved_delta,
    stock_after, reserved_after, order_id, note, created_by
  ) values (
    p_variant_id, p_type, p_stock_delta, p_reserved_delta,
    v_stock, v_reserved, p_order_id, p_note, coalesce(p_actor, auth.uid())
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.apply_stock_movement(uuid, public.movement_type, integer, integer, uuid, text, uuid) from public;


-- -----------------------------------------------------------------------------
-- adjust_stock - la que usa el administrador desde el celular (puntos 57, 131)
-- -----------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_variant_id uuid,
  p_delta      integer,
  p_type       public.movement_type default 'adjustment',
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_move public.inventory_movements;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_delta = 0 then
    raise exception 'NO_OP_MOVEMENT' using errcode = 'P0001';
  end if;

  if p_type not in ('initial', 'restock', 'adjustment', 'cancellation') then
    raise exception 'INVALID_MOVEMENT_TYPE' using errcode = 'P0001';
  end if;

  v_move := public.apply_stock_movement(
    p_variant_id, p_type, p_delta, 0, null, p_note, auth.uid()
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, after)
  values (
    auth.uid(), 'stock.adjust', 'product_variant', p_variant_id,
    jsonb_build_object(
      'delta', p_delta, 'type', p_type,
      'stock_after', v_move.stock_after, 'reserved_after', v_move.reserved_after
    )
  );

  return jsonb_build_object(
    'variant_id',     p_variant_id,
    'stock',          v_move.stock_after,
    'reserved',       v_move.reserved_after,
    'available',      greatest(v_move.stock_after - v_move.reserved_after, 0),
    'movement_id',    v_move.id
  );
end;
$$;

grant execute on function public.adjust_stock(uuid, integer, public.movement_type, text) to authenticated;


-- =============================================================================
-- create_order - TODO O NADA (punto 162)
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
           p.deleted_at
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

    if v_price.final_price is null then
      raise exception 'PRICE_UNAVAILABLE:%', v_item.variant_id using errcode = 'P0001';
    end if;

    v_line_total := round(v_price.final_price * v_item.quantity, 2);
    v_subtotal   := v_subtotal + round(v_price.list_price * v_item.quantity, 2);
    v_discount   := v_discount + round(v_price.discount_amount * v_item.quantity, 2);

    -- 6d. cuanto se reserva realmente del inventario fisico
    v_reserve_qty := least(
      v_item.quantity,
      greatest(v_item.stock - v_item.reserved, 0)
    );

    -- 6e. etiqueta e imagen, congeladas
    v_label := public.variant_label(v_item.variant_id);

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
      promotion_id, promotion_title
    ) values (
      v_order_id, v_item.product_id, v_item.variant_id,
      v_item.product_name, v_item.product_slug, v_label, v_item.sku, v_cover,
      v_price.final_price,
      case when v_price.discount_amount > 0 then v_price.list_price end,
      round(v_price.discount_amount * v_item.quantity, 2),
      v_item.quantity, v_reserve_qty, v_line_total,
      v_price.promotion_id, v_price.promotion_title
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

grant execute on function public.create_order(uuid, text, text, text, text, text, text, jsonb, text)
  to anon, authenticated;


-- =============================================================================
-- set_order_status - transiciones validas y efectos sobre el inventario
-- =============================================================================
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status   public.order_status,
  p_note     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_item  record;
  v_was_paid boolean;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_order.status = p_status then
    return jsonb_build_object('order_id', p_order_id, 'status', p_status, 'changed', false);
  end if;

  -- No se puede saltar de pending a delivered, ni "descancelar" un pedido.
  if not (
    (v_order.status = 'pending'          and p_status in ('contacted','awaiting_payment','paid','cancelled')) or
    (v_order.status = 'contacted'        and p_status in ('awaiting_payment','paid','cancelled')) or
    (v_order.status = 'awaiting_payment' and p_status in ('paid','cancelled')) or
    (v_order.status = 'paid'             and p_status in ('preparing','delivered','cancelled')) or
    (v_order.status = 'preparing'        and p_status in ('delivered','cancelled'))
  ) then
    raise exception 'INVALID_TRANSITION:%->%', v_order.status, p_status using errcode = 'P0001';
  end if;

  -- el pedido ya habia pasado por caja?
  v_was_paid := v_order.status in ('paid', 'preparing', 'delivered');

  -- ---------------------------------------------------------------------------
  -- LA LINEA GRUESA: entrar en 'paid' es lo unico que baja el stock fisico
  -- ---------------------------------------------------------------------------
  if p_status = 'paid' and not v_was_paid then
    for v_item in
      select variant_id, reserved_quantity
        from public.order_items
       where order_id = p_order_id and variant_id is not null and reserved_quantity > 0
       order by variant_id
    loop
      perform public.apply_stock_movement(
        v_item.variant_id, 'sale',
        -v_item.reserved_quantity,     -- sale del inventario fisico
        -v_item.reserved_quantity,     -- y deja de estar reservado
        p_order_id, 'Venta ' || v_order.order_number, auth.uid()
      );
    end loop;

    update public.orders
       set paid_at = now(), paid_by = auth.uid()
     where id = p_order_id;

  -- ---------------------------------------------------------------------------
  -- CANCELACION: se devuelve exactamente lo que se habia tomado
  -- ---------------------------------------------------------------------------
  elsif p_status = 'cancelled' then
    for v_item in
      select variant_id, reserved_quantity
        from public.order_items
       where order_id = p_order_id and variant_id is not null and reserved_quantity > 0
       order by variant_id
    loop
      if v_was_paid then
        -- ya habia salido del inventario: vuelve
        perform public.apply_stock_movement(
          v_item.variant_id, 'cancellation',
          v_item.reserved_quantity, 0,
          p_order_id, 'Cancelacion ' || v_order.order_number, auth.uid()
        );
      else
        -- solo estaba reservado: se libera, el inventario nunca se toco
        perform public.apply_stock_movement(
          v_item.variant_id, 'release',
          0, -v_item.reserved_quantity,
          p_order_id, 'Liberacion por cancelacion ' || v_order.order_number, auth.uid()
        );
      end if;
    end loop;

    update public.orders
       set cancelled_at = now(), cancel_reason = p_note
     where id = p_order_id;
  end if;

  update public.orders set status = p_status where id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (p_order_id, v_order.status, p_status, auth.uid(), p_note);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(), 'order.status', 'order', p_order_id,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', p_status, 'note', p_note)
  );

  -- El cliente se entera (solo si tiene cuenta; el invitado usa su enlace)
  if v_order.user_id is not null then
    insert into public.notifications (
      audience, user_id, type, title, body, link, entity_type, entity_id, group_key
    ) values (
      'customer', v_order.user_id, 'order_status',
      'Tu pedido ' || v_order.order_number,
      public.order_status_label(p_status),
      '/cuenta/pedidos/' || v_order.order_number,
      'order', p_order_id,
      'order:' || p_order_id::text || ':' || p_status::text
    );
  end if;

  return jsonb_build_object('order_id', p_order_id, 'status', p_status, 'changed', true);
end;
$$;

grant execute on function public.set_order_status(uuid, public.order_status, text) to authenticated;


-- =============================================================================
-- cancel_order_by_customer - el cliente puede arrepentirse antes de pagar
-- =============================================================================
create or replace function public.cancel_order_by_customer(
  p_order_id uuid,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_item  record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_order.user_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- despues de pagar, la cancelacion la maneja el administrador
  if v_order.status not in ('pending', 'contacted', 'awaiting_payment') then
    raise exception 'NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  for v_item in
    select variant_id, reserved_quantity
      from public.order_items
     where order_id = p_order_id and variant_id is not null and reserved_quantity > 0
     order by variant_id
  loop
    perform public.apply_stock_movement(
      v_item.variant_id, 'release', 0, -v_item.reserved_quantity,
      p_order_id, 'Cancelado por el cliente', auth.uid()
    );
  end loop;

  update public.orders
     set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
   where id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (p_order_id, v_order.status, 'cancelled', auth.uid(), coalesce(p_reason, 'Cancelado por el cliente'));

  insert into public.notifications (
    audience, type, title, body, link, entity_type, entity_id, group_key
  ) values (
    'admin', 'order_cancelled',
    'Pedido cancelado ' || v_order.order_number,
    coalesce(p_reason, 'El cliente cancelo el pedido'),
    '/admin/pedidos/' || p_order_id::text,
    'order', p_order_id, 'order:' || p_order_id::text || ':cancelled'
  );

  return jsonb_build_object('order_id', p_order_id, 'status', 'cancelled');
end;
$$;

grant execute on function public.cancel_order_by_customer(uuid, text) to authenticated;


-- =============================================================================
-- get_order_public - el invitado ve SU pedido, y solo el suyo
--   orders queda cerrada a anon. Este es el unico camino, y exige el token.
-- =============================================================================
create or replace function public.get_order_public(
  p_order_number text,
  p_token        uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_result jsonb;
begin
  select * into v_order
    from public.orders
   where order_number = upper(trim(p_order_number))
     and access_token = p_token;

  if not found then
    return null;   -- mismo resultado para "no existe" y "token incorrecto"
  end if;

  select jsonb_build_object(
    'order_number',   v_order.order_number,
    'status',         v_order.status,
    'status_label',   public.order_status_label(v_order.status),
    'created_at',     v_order.created_at,
    'customer_name',  v_order.customer_name,
    'delivery_method',v_order.delivery_method,
    'subtotal',       v_order.subtotal,
    'discount_total', v_order.discount_total,
    'delivery_cost',  v_order.delivery_cost,
    'total',          v_order.total,
    'customer_note',  v_order.customer_note,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name',  oi.product_name,
        'product_slug',  oi.product_slug,
        'variant_label', oi.variant_label,
        'image_url',     oi.image_url,
        'quantity',      oi.quantity,
        'unit_price',    oi.unit_price,
        'line_total',    oi.line_total
      ) order by oi.created_at)
      from public.order_items oi where oi.order_id = v_order.id
    ), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status',     h.to_status,
        'label',      public.order_status_label(h.to_status),
        'created_at', h.created_at
      ) order by h.created_at)
      from public.order_status_history h where h.order_id = v_order.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_order_public(text, uuid) to anon, authenticated;


-- =============================================================================
-- merge_cart - al iniciar sesion, el carrito anonimo se suma al de la cuenta
-- =============================================================================
create or replace function public.merge_cart(p_anon_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_anon_cart public.carts;
  v_user_cart_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_anon_cart
    from public.carts
   where anon_token = p_anon_token and status = 'active'
     for update;

  -- carrito de la cuenta (se crea si no existe)
  select id into v_user_cart_id
    from public.carts
   where user_id = v_user and status = 'active';

  if v_user_cart_id is null then
    insert into public.carts (user_id) values (v_user) returning id into v_user_cart_id;
  end if;

  if v_anon_cart.id is null then
    return v_user_cart_id;
  end if;

  -- sumar cantidades, con tope de 99 por linea
  insert into public.cart_items (cart_id, variant_id, quantity)
  select v_user_cart_id, ci.variant_id, ci.quantity
    from public.cart_items ci
   where ci.cart_id = v_anon_cart.id
  on conflict (cart_id, variant_id) do update
    set quantity = least(public.cart_items.quantity + excluded.quantity, 99);

  delete from public.carts where id = v_anon_cart.id;

  return v_user_cart_id;
end;
$$;

grant execute on function public.merge_cart(text) to authenticated;


-- =============================================================================
-- link_guest_orders - los pedidos hechos como invitado aparecen en Mi cuenta
--   Solo si el email del usuario esta VERIFICADO: si no, cualquiera podria
--   registrarse con el mail de otro y quedarse con sus pedidos.
-- =============================================================================
create or replace function public.link_guest_orders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_email    text;
  v_verified timestamptz;
  v_linked   integer;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select lower(u.email), u.email_confirmed_at
    into v_email, v_verified
    from auth.users u
   where u.id = v_user;

  if v_email is null or v_verified is null then
    return 0;
  end if;

  update public.orders
     set user_id = v_user
   where user_id is null
     and lower(customer_email) = v_email;

  get diagnostics v_linked = row_count;
  return v_linked;
end;
$$;

grant execute on function public.link_guest_orders() to authenticated;


-- =============================================================================
-- track_event - analiticas con dedupe silencioso (punto 174)
-- =============================================================================
create or replace function public.track_event(
  p_event_type  public.analytics_event_type,
  p_session_id  text,
  p_product_id  uuid default null,
  p_variant_id  uuid default null,
  p_category_id uuid default null,
  p_media_id    uuid default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_session_id is null or length(p_session_id) between 1 and 7 then
    return false;
  end if;

  -- 120 eventos por minuto por sesion es muchisimo para un humano
  if not public.check_rate_limit('analytics:' || p_session_id, 120, 60) then
    return false;
  end if;

  insert into public.analytics_events (
    event_type, session_id, product_id, variant_id, category_id, media_id, metadata
  ) values (
    p_event_type, p_session_id, p_product_id, p_variant_id, p_category_id, p_media_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  -- los indices unicos parciales absorben los repetidos del dia en silencio
  on conflict do nothing;

  return true;
end;
$$;

grant execute on function public.track_event(
  public.analytics_event_type, text, uuid, uuid, uuid, uuid, jsonb
) to anon, authenticated;
