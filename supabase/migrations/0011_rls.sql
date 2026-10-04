-- =============================================================================
-- Alma Tejida · 0011 · Row Level Security
--
--   Una tabla con RLS activo y cero policies DENIEGA TODO. Ese es el estado
--   seguro por defecto, y es a proposito: si manana se agrega una tabla y
--   alguien olvida su policy, el resultado es "nadie entra", no "entran todos".
--
--   Nota sobre service_role: en Supabase tiene BYPASSRLS. Por eso la
--   SUPABASE_SERVICE_ROLE_KEY jamas sale del servidor, y por eso el modulo que
--   la instancia empieza con `import 'server-only'`.
-- =============================================================================

alter table public.profiles                 enable row level security;
alter table public.store_settings           enable row level security;
alter table public.categories               enable row level security;
alter table public.products                 enable row level security;
alter table public.product_attributes       enable row level security;
alter table public.product_attribute_values enable row level security;
alter table public.product_variants         enable row level security;
alter table public.variant_option_values    enable row level security;
alter table public.product_media            enable row level security;
alter table public.price_history            enable row level security;
alter table public.promotions               enable row level security;
alter table public.promotion_targets        enable row level security;
alter table public.carts                    enable row level security;
alter table public.cart_items               enable row level security;
alter table public.orders                   enable row level security;
alter table public.order_items              enable row level security;
alter table public.order_status_history     enable row level security;
alter table public.payment_proofs           enable row level security;
alter table public.inventory_movements      enable row level security;
alter table public.questions                enable row level security;
alter table public.reviews                  enable row level security;
alter table public.favorites                enable row level security;
alter table public.restock_requests         enable row level security;
alter table public.notifications            enable row level security;
alter table public.analytics_events         enable row level security;
alter table public.analytics_daily          enable row level security;
alter table public.audit_log                enable row level security;
alter table public.rate_limit_hits          enable row level security;

-- Tablas que NUNCA se tocan desde el navegador, ni con RLS de por medio.
-- Solo las escriben funciones SECURITY DEFINER.
revoke all on public.inventory_movements from anon, authenticated;
revoke all on public.analytics_events    from anon, authenticated;
revoke all on public.analytics_daily     from anon, authenticated;
revoke all on public.audit_log           from anon, authenticated;
revoke all on public.rate_limit_hits     from anon, authenticated;
revoke all on public.price_history       from anon, authenticated;
grant select on public.inventory_movements to authenticated;   -- solo admin, via policy
grant select on public.analytics_daily     to authenticated;
grant select on public.audit_log           to authenticated;
grant select on public.price_history       to authenticated;


-- =============================================================================
-- profiles
-- =============================================================================
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- EL CLIENTE NO PUEDE ESCALAR SU PROPIO ROL.
-- El WITH CHECK compara el rol entrante con el rol guardado: un UPDATE que
-- intente poner role = 'admin' falla, aunque venga del dueno de la fila.
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = public.current_user_role()
  );

create policy "profiles_admin_all" on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- =============================================================================
-- store_settings
--   Lectura publica: el alias y el banco son justamente los datos que el
--   negocio publica para recibir transferencias. No hay dato de terceros aca.
-- =============================================================================
create policy "store_settings_read_all" on public.store_settings
  for select to anon, authenticated using (true);

create policy "store_settings_admin_write" on public.store_settings
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- =============================================================================
-- categories
-- =============================================================================
create policy "categories_read_visible" on public.categories
  for select to anon, authenticated
  using (is_visible and deleted_at is null);

create policy "categories_admin_all" on public.categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- =============================================================================
-- products y todo lo que cuelga de ellos
--   El publico ve UNICAMENTE lo publicado. Un borrador es invisible: no
--   aparece en el catalogo, ni por URL, ni por la API.
-- =============================================================================
create policy "products_read_published" on public.products
  for select to anon, authenticated
  using (status = 'published' and deleted_at is null);

create policy "products_admin_all" on public.products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


create policy "attributes_read_published" on public.product_attributes
  for select to anon, authenticated
  using (exists (
    select 1 from public.products p
    where p.id = product_attributes.product_id
      and p.status = 'published' and p.deleted_at is null
  ));

create policy "attributes_admin_all" on public.product_attributes
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


create policy "attribute_values_read_published" on public.product_attribute_values
  for select to anon, authenticated
  using (exists (
    select 1
    from public.product_attributes pa
    join public.products p on p.id = pa.product_id
    where pa.id = product_attribute_values.attribute_id
      and p.status = 'published' and p.deleted_at is null
  ));

create policy "attribute_values_admin_all" on public.product_attribute_values
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


create policy "variants_read_published" on public.product_variants
  for select to anon, authenticated
  using (
    is_active and exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and p.status = 'published' and p.deleted_at is null
    )
  );

create policy "variants_admin_all" on public.product_variants
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


create policy "variant_options_read_published" on public.variant_option_values
  for select to anon, authenticated
  using (exists (
    select 1
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = variant_option_values.variant_id
      and p.status = 'published' and p.deleted_at is null
  ));

create policy "variant_options_admin_all" on public.variant_option_values
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


create policy "media_read_published" on public.product_media
  for select to anon, authenticated
  using (exists (
    select 1 from public.products p
    where p.id = product_media.product_id
      and p.status = 'published' and p.deleted_at is null
  ));

create policy "media_admin_all" on public.product_media
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- El historial de precios es informacion comercial interna.
create policy "price_history_admin_read" on public.price_history
  for select to authenticated using (public.is_admin());


-- =============================================================================
-- promotions
--   "Activa" no alcanza: una promocion con fecha futura o vencida no es
--   vigente, y no debe verse.
-- =============================================================================
create policy "promotions_read_current" on public.promotions
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   >= now())
  );

create policy "promotions_admin_all" on public.promotions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


create policy "promotion_targets_read_current" on public.promotion_targets
  for select to anon, authenticated
  using (exists (
    select 1 from public.promotions pr
    where pr.id = promotion_targets.promotion_id
      and pr.is_active
      and (pr.starts_at is null or pr.starts_at <= now())
      and (pr.ends_at   is null or pr.ends_at   >= now())
  ));

create policy "promotion_targets_admin_all" on public.promotion_targets
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- =============================================================================
-- carts / cart_items
--   El carrito del VISITANTE vive en localStorage y se sincroniza desde el
--   servidor. anon no tiene ningun acceso a estas tablas: no hay forma de que
--   RLS distinga a un anonimo de otro, asi que no se intenta.
-- =============================================================================
create policy "carts_own" on public.carts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "carts_admin_read" on public.carts
  for select to authenticated using (public.is_admin());

create policy "cart_items_own" on public.cart_items
  for all to authenticated
  using (exists (
    select 1 from public.carts c
    where c.id = cart_items.cart_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.carts c
    where c.id = cart_items.cart_id and c.user_id = auth.uid()
  ));


-- =============================================================================
-- orders
--   anon NO tiene policy: la tabla esta cerrada. El invitado llega unicamente
--   por get_order_public(numero, token), que exige el token de 122 bits.
-- =============================================================================
create policy "orders_read_own" on public.orders
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Los pedidos se crean SOLO por create_order(). No hay INSERT directo:
-- un insert a mano se saltearia la reserva de stock y el snapshot de precios.
create policy "orders_admin_write" on public.orders
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());


create policy "order_items_read_own" on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  ));


create policy "order_history_read_own" on public.order_status_history
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_status_history.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  ));


-- =============================================================================
-- payment_proofs  (bucket privado; esta tabla es solo el indice)
-- =============================================================================
create policy "proofs_read_own" on public.payment_proofs
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = payment_proofs.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  ));

create policy "proofs_insert_own" on public.payment_proofs
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = payment_proofs.order_id and o.user_id = auth.uid()
    )
  );

create policy "proofs_admin_all" on public.payment_proofs
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- =============================================================================
-- inventory_movements  (solo lectura, solo admin)
--   Se escriben exclusivamente desde apply_stock_movement().
-- =============================================================================
create policy "movements_admin_read" on public.inventory_movements
  for select to authenticated using (public.is_admin());


-- =============================================================================
-- questions
--   Nace privada. Solo se ve si el administrador decide publicarla.
-- =============================================================================
create policy "questions_read_published_or_own" on public.questions
  for select to anon, authenticated
  using (
    status = 'published'
    or (auth.uid() is not null and user_id = auth.uid())
    or public.is_admin()
  );

create policy "questions_insert_own" on public.questions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'          -- ninguna pregunta nace publicada
    and answer is null
  );

create policy "questions_admin_all" on public.questions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- =============================================================================
-- reviews  ·  COMPRA VERIFICADA garantizada por la base (punto 80)
-- =============================================================================
create policy "reviews_read_approved_or_own" on public.reviews
  for select to anon, authenticated
  using (
    status = 'approved'
    or (auth.uid() is not null and user_id = auth.uid())
    or public.is_admin()
  );

create policy "reviews_insert_verified" on public.reviews
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'            -- ninguna resena nace aprobada
    and admin_reply is null
    and exists (
      select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.id = reviews.order_id
        and o.user_id = auth.uid()
        and o.status in ('paid', 'preparing', 'delivered')
        and oi.product_id = reviews.product_id
    )
  );

-- El autor puede corregir su resena mientras siga pendiente de moderacion.
create policy "reviews_update_own_pending" on public.reviews
  for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and admin_reply is null
  );

create policy "reviews_admin_all" on public.reviews
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- =============================================================================
-- favorites
-- =============================================================================
create policy "favorites_own" on public.favorites
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- =============================================================================
-- restock_requests  ("avisame cuando vuelva")
--   Se insertan desde una Server Action con rate limit. El cliente no las lee:
--   no hay nada que mirar, y listarlas expondria emails de otras personas.
-- =============================================================================
create policy "restock_admin_read" on public.restock_requests
  for select to authenticated using (public.is_admin());

create policy "restock_admin_write" on public.restock_requests
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- =============================================================================
-- notifications
-- =============================================================================
create policy "notifications_read_mine" on public.notifications
  for select to authenticated
  using (
    (audience = 'customer' and user_id = auth.uid())
    or (audience = 'admin' and public.is_admin())
  );

-- Marcar como leida es lo unico que se puede cambiar.
create policy "notifications_mark_read" on public.notifications
  for update to authenticated
  using (
    (audience = 'customer' and user_id = auth.uid())
    or (audience = 'admin' and public.is_admin())
  )
  with check (
    (audience = 'customer' and user_id = auth.uid())
    or (audience = 'admin' and public.is_admin())
  );


-- =============================================================================
-- analiticas y auditoria  (solo lectura, solo admin)
-- =============================================================================
create policy "analytics_daily_admin_read" on public.analytics_daily
  for select to authenticated using (public.is_admin());

create policy "audit_log_admin_read" on public.audit_log
  for select to authenticated using (public.is_admin());

-- analytics_events y rate_limit_hits: SIN POLICIES. Nadie las toca desde el
-- navegador. Se escriben solo por track_event() y check_rate_limit().
