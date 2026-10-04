-- =============================================================================
-- Alma Tejida · 0010 · Triggers: busqueda, rating, precios, avisos
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Busqueda (punto 32)
--   Un trigger y no una columna generada, porque el vector incluye datos de
--   OTRAS tablas (nombre de categoria y valores de atributo), cosa que una
--   columna generada no puede hacer.
-- -----------------------------------------------------------------------------
create or replace function public.refresh_product_search(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.products p
     set search_vector =
         setweight(to_tsvector('spanish', public.at_unaccent(coalesce(p.name, ''))), 'A')
       || setweight(to_tsvector('spanish', public.at_unaccent(
            coalesce((select c.name from public.categories c where c.id = p.category_id), '')
          )), 'B')
       || setweight(to_tsvector('spanish', public.at_unaccent(
            coalesce((
              select string_agg(pav.value, ' ')
              from public.product_attributes pa
              join public.product_attribute_values pav on pav.attribute_id = pa.id
              where pa.product_id = p.id
            ), '')
          )), 'B')
       || setweight(to_tsvector('spanish', public.at_unaccent(coalesce(p.short_description, ''))), 'C')
       || setweight(to_tsvector('spanish', public.at_unaccent(coalesce(p.description, ''))), 'D')
   where p.id = p_product_id;
end;
$$;


create or replace function public.trg_refresh_search_from_product()
returns trigger language plpgsql as $$
begin
  perform public.refresh_product_search(new.id);
  return null;
end;
$$;

create trigger products_refresh_search
  after insert or update of name, short_description, description, category_id
  on public.products
  for each row execute function public.trg_refresh_search_from_product();


create or replace function public.trg_refresh_search_from_value()
returns trigger language plpgsql as $$
declare
  v_product uuid;
begin
  select pa.product_id into v_product
    from public.product_attributes pa
   where pa.id = coalesce(new.attribute_id, old.attribute_id);

  if v_product is not null then
    perform public.refresh_product_search(v_product);
  end if;

  return null;
end;
$$;

create trigger pav_refresh_search
  after insert or update or delete on public.product_attribute_values
  for each row execute function public.trg_refresh_search_from_value();


-- Renombrar una categoria reindexa sus productos.
create or replace function public.trg_refresh_search_from_category()
returns trigger language plpgsql as $$
declare
  v_id uuid;
begin
  for v_id in select id from public.products where category_id = new.id loop
    perform public.refresh_product_search(v_id);
  end loop;
  return null;
end;
$$;

create trigger categories_refresh_search
  after update of name on public.categories
  for each row when (old.name is distinct from new.name)
  execute function public.trg_refresh_search_from_category();


-- -----------------------------------------------------------------------------
-- TODO producto tiene al menos una variante (decision D1)
--   El administrador nunca ve la palabra "variante" en un producto simple:
--   carga un numero de stock y listo. La uniformidad es interna.
-- -----------------------------------------------------------------------------
create or replace function public.trg_create_default_variant()
returns trigger language plpgsql as $$
begin
  insert into public.product_variants (product_id, is_default, is_active, position)
  values (new.id, true, true, 0);
  return null;
end;
$$;

create trigger products_default_variant
  after insert on public.products
  for each row execute function public.trg_create_default_variant();


-- -----------------------------------------------------------------------------
-- published_at se fija la PRIMERA vez que se publica. Es la base del badge
-- "Nuevo" (punto 111): despublicar y volver a publicar no rejuvenece un producto.
-- -----------------------------------------------------------------------------
create or replace function public.trg_set_published_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger products_set_published_at
  before insert or update of status on public.products
  for each row execute function public.trg_set_published_at();


-- -----------------------------------------------------------------------------
-- Rating agregado (punto 83)
--   Se recalcula sobre las resenas APROBADAS. Guardarlo en la fila del producto
--   evita un AVG por cada tarjeta del catalogo.
-- -----------------------------------------------------------------------------
create or replace function public.recalc_product_rating(p_product_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.products p
     set rating_avg = coalesce(r.avg_rating, 0),
         rating_count = coalesce(r.n, 0)
    from (
      select round(avg(rating)::numeric, 2) as avg_rating, count(*)::int as n
      from public.reviews
      where product_id = p_product_id and status = 'approved'
    ) r
   where p.id = p_product_id;
$$;

create or replace function public.trg_recalc_rating()
returns trigger language plpgsql as $$
begin
  perform public.recalc_product_rating(coalesce(new.product_id, old.product_id));
  if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
    perform public.recalc_product_rating(old.product_id);
  end if;
  return null;
end;
$$;

create trigger reviews_recalc_rating
  after insert or update or delete on public.reviews
  for each row execute function public.trg_recalc_rating();


-- -----------------------------------------------------------------------------
-- Historial de precios (punto 46)
-- -----------------------------------------------------------------------------
create or replace function public.trg_log_product_price()
returns trigger language plpgsql as $$
begin
  if new.base_price is distinct from old.base_price then
    insert into public.price_history (product_id, field, old_price, new_price, changed_by)
    values (new.id, 'base_price', old.base_price, new.base_price, auth.uid());
  end if;

  if new.sale_price is distinct from old.sale_price then
    insert into public.price_history (product_id, field, old_price, new_price, changed_by)
    values (new.id, 'sale_price', old.sale_price, new.sale_price, auth.uid());
  end if;

  return null;
end;
$$;

create trigger products_log_price
  after update of base_price, sale_price on public.products
  for each row execute function public.trg_log_product_price();


create or replace function public.trg_log_variant_price()
returns trigger language plpgsql as $$
begin
  if new.price_override is distinct from old.price_override then
    insert into public.price_history (product_id, variant_id, field, old_price, new_price, changed_by)
    values (new.product_id, new.id, 'price_override', old.price_override, new.price_override, auth.uid());
  end if;
  return null;
end;
$$;

create trigger variants_log_price
  after update of price_override on public.product_variants
  for each row execute function public.trg_log_variant_price();


-- -----------------------------------------------------------------------------
-- Aviso de stock bajo (puntos 97, 98)
--   Solo al CRUZAR el umbral hacia abajo, y una sola vez mientras siga sin
--   leerse. Un indice unico hace imposible el spam (punto 99).
-- -----------------------------------------------------------------------------
create unique index notifications_unread_group_key
  on public.notifications (group_key)
  where group_key is not null and read_at is null and audience = 'admin';

create or replace function public.trg_notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_threshold  integer;
  v_before     integer;
  v_after      integer;
  v_name       text;
  v_status     public.product_status;
  v_deleted_at timestamptz;
  v_label      text;
begin
  select coalesce(new.low_stock_threshold, p.low_stock_threshold),
         p.name, p.status, p.deleted_at
    into v_threshold, v_name, v_status, v_deleted_at
    from public.products p
   where p.id = new.product_id;

  -- no tiene sentido avisar por el stock de algo que no esta a la venta
  if v_status is distinct from 'published' or v_deleted_at is not null then
    return null;
  end if;

  v_before := greatest(old.stock - old.reserved, 0);
  v_after  := greatest(new.stock - new.reserved, 0);

  -- solo el cruce hacia abajo genera aviso
  if v_after <= v_threshold and v_before > v_threshold then
    v_label := public.variant_label(new.id);

    insert into public.notifications (
      audience, type, title, body, link, entity_type, entity_id, group_key
    ) values (
      'admin',
      'low_stock',
      case when v_after = 0 then 'Sin stock: ' || v_name
           else 'Stock bajo: ' || v_name end,
      coalesce(v_label || ' · ', '') || 'Quedan ' || v_after || ' unidades',
      '/admin/stock?variante=' || new.id::text,
      'product_variant',
      new.id,
      'low_stock:' || new.id::text
    )
    on conflict do nothing;   -- ya hay un aviso sin leer para esta variante
  end if;

  return null;
end;
$$;

create trigger variants_notify_low_stock
  after update of stock, reserved on public.product_variants
  for each row
  when ((old.stock - old.reserved) is distinct from (new.stock - new.reserved))
  execute function public.trg_notify_low_stock();


-- -----------------------------------------------------------------------------
-- Preguntas y resenas (puntos 78, 79, 98)
-- -----------------------------------------------------------------------------
create or replace function public.trg_notify_new_question()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  select name into v_name from public.products where id = new.product_id;

  insert into public.notifications (
    audience, type, title, body, link, entity_type, entity_id, group_key
  ) values (
    'admin', 'question_asked',
    'Nueva pregunta',
    coalesce(v_name, 'Producto') || ': ' || left(new.body, 120),
    '/admin/preguntas?id=' || new.id::text,
    'question', new.id,
    'question:' || new.id::text
  )
  on conflict do nothing;

  return null;
end;
$$;

create trigger questions_notify_admin
  after insert on public.questions
  for each row execute function public.trg_notify_new_question();


create or replace function public.trg_notify_question_answered()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
  v_name text;
begin
  -- solo cuando aparece una respuesta que antes no existia
  if new.user_id is null then
    return null;
  end if;
  if old.answer is not distinct from new.answer or new.answer is null then
    return null;
  end if;

  select slug, name into v_slug, v_name from public.products where id = new.product_id;

  insert into public.notifications (
    audience, user_id, type, title, body, link, entity_type, entity_id, group_key
  ) values (
    'customer', new.user_id, 'question_answered',
    'Respondimos tu pregunta',
    coalesce(v_name, 'Producto') || ': ' || left(new.answer, 120),
    '/producto/' || coalesce(v_slug, ''),
    'question', new.id,
    'question:' || new.id::text || ':answered'
  );

  return null;
end;
$$;

create trigger questions_notify_customer
  after update of answer on public.questions
  for each row execute function public.trg_notify_question_answered();


create or replace function public.trg_notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  select name into v_name from public.products where id = new.product_id;

  insert into public.notifications (
    audience, type, title, body, link, entity_type, entity_id, group_key
  ) values (
    'admin', 'review_created',
    'Nueva resena · ' || new.rating || '★',
    coalesce(v_name, 'Producto') || coalesce(': ' || left(new.body, 100), ''),
    '/admin/resenas?id=' || new.id::text,
    'review', new.id,
    'review:' || new.id::text
  )
  on conflict do nothing;

  return null;
end;
$$;

create trigger reviews_notify_admin
  after insert on public.reviews
  for each row execute function public.trg_notify_new_review();


-- -----------------------------------------------------------------------------
-- Comprobante de pago subido (punto 66)
-- -----------------------------------------------------------------------------
create or replace function public.trg_notify_payment_proof()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_number text;
begin
  select order_number into v_number from public.orders where id = new.order_id;

  insert into public.notifications (
    audience, type, title, body, link, entity_type, entity_id, group_key
  ) values (
    'admin', 'payment_proof',
    'Comprobante recibido',
    'Pedido ' || coalesce(v_number, ''),
    '/admin/pedidos/' || new.order_id::text,
    'order', new.order_id,
    'proof:' || new.id::text
  )
  on conflict do nothing;

  return null;
end;
$$;

create trigger payment_proofs_notify_admin
  after insert on public.payment_proofs
  for each row execute function public.trg_notify_payment_proof();
