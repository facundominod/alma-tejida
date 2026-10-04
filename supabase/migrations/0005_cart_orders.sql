-- =============================================================================
-- Alma Tejida · 0005 · Carrito, pedidos e inventario
-- =============================================================================

-- -----------------------------------------------------------------------------
-- carts / cart_items
-- -----------------------------------------------------------------------------
create table public.carts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  anon_token  text,                                -- visitante sin cuenta
  status      public.cart_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- exactamente un dueno: o una cuenta, o un token anonimo
  constraint carts_exactly_one_owner check (
    (user_id is not null)::int + (anon_token is not null)::int = 1
  )
);

create unique index carts_active_user_key
  on public.carts (user_id) where status = 'active' and user_id is not null;
create unique index carts_anon_token_key
  on public.carts (anon_token) where anon_token is not null;
create index carts_updated_idx on public.carts (updated_at) where status = 'active';

create trigger carts_touch
  before update on public.carts
  for each row execute function public.touch_updated_at();


create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity   integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cart_items_quantity_positive check (quantity > 0 and quantity <= 99)
);

comment on table public.cart_items is
  'NO guarda precio. El precio se resuelve siempre al leer, con effective_price().';

create unique index cart_items_unique on public.cart_items (cart_id, variant_id);
create index cart_items_cart_idx on public.cart_items (cart_id);

create trigger cart_items_touch
  before update on public.cart_items
  for each row execute function public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
-- Numero legible para humanos: AT-00128 (punto 164).
create sequence public.order_number_seq start 1;

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null default (
    'AT-' || lpad(nextval('public.order_number_seq')::text, 5, '0')
  ),
  -- permite a un invitado seguir su pedido sin crear cuenta (punto 9).
  -- UUID v4 = 122 bits de entropia: adivinarlo no es una estrategia.
  access_token     uuid not null default gen_random_uuid(),

  user_id          uuid references public.profiles(id) on delete set null,

  -- datos minimos indispensables (punto 115)
  customer_name    text not null,
  customer_email   text not null,
  customer_phone   text not null,

  delivery_method  text,                          -- clave de store_settings.delivery_methods
  shipping_address jsonb,

  status           public.order_status not null default 'pending',

  -- SIEMPRE calculados en el servidor (punto 108)
  subtotal         numeric(12,2) not null default 0,
  discount_total   numeric(12,2) not null default 0,
  delivery_cost    numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  currency         text not null default 'ARS',

  customer_note    text,
  internal_note    text,                          -- solo admin, invisible al cliente (punto 167)

  -- el doble clic no crea dos pedidos (punto 163)
  idempotency_key  text not null,

  paid_at          timestamptz,
  paid_by          uuid references public.profiles(id) on delete set null,
  cancelled_at     timestamptz,
  cancel_reason    text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint orders_totals_not_negative check (
    subtotal >= 0 and discount_total >= 0 and delivery_cost >= 0 and total >= 0
  ),
  constraint orders_email_shape check (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint orders_name_not_blank check (length(trim(customer_name)) > 0),
  constraint orders_phone_not_blank check (length(trim(customer_phone)) > 0)
);

create unique index orders_number_key          on public.orders (order_number);
create unique index orders_idempotency_key     on public.orders (idempotency_key);
create index orders_user_idx                   on public.orders (user_id, created_at desc);
create index orders_status_idx                 on public.orders (status, created_at desc);
create index orders_email_idx                  on public.orders (lower(customer_email));
create index orders_created_idx                on public.orders (created_at desc);
-- para el dashboard: pedidos cobrados del periodo
create index orders_paid_idx on public.orders (paid_at desc)
  where status in ('paid', 'preparing', 'delivered');

create trigger orders_touch
  before update on public.orders
  for each row execute function public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- order_items  ·  LA FOTOGRAFIA (decision D3, puntos 46, 47, 172)
--   Copia literal del momento de la compra. Un pedido viejo NO cambia porque
--   hoy cambio el precio, el nombre o la promocion.
-- -----------------------------------------------------------------------------
create table public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete cascade,

  -- referencias para poder linkear; el historico no depende de ellas
  product_id         uuid references public.products(id) on delete set null,
  variant_id         uuid references public.product_variants(id) on delete set null,

  -- snapshot
  product_name       text not null,
  product_slug       text,
  variant_label      text,                        -- "Crudo · 1,50 x 2,00"
  sku                text,
  image_url          text,
  unit_price         numeric(12,2) not null,      -- lo que se pago por unidad
  unit_compare_price numeric(12,2),               -- precio de lista al momento
  discount_amount    numeric(12,2) not null default 0,
  quantity           integer not null,
  -- cuantas unidades quedaron efectivamente reservadas del inventario fisico.
  -- Para un producto "a pedido" sin stock esto es 0: no hay nada que reservar,
  -- se fabrica. Guardarlo hace que confirmar el pago o cancelar devuelva
  -- EXACTAMENTE lo que se tomo, sin recalcular ni adivinar.
  reserved_quantity  integer not null default 0,
  line_total         numeric(12,2) not null,
  promotion_id       uuid references public.promotions(id) on delete set null,
  promotion_title    text,                        -- congelado (punto 172)
  created_at         timestamptz not null default now(),

  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_reserved_within_quantity check (
    reserved_quantity >= 0 and reserved_quantity <= quantity
  ),
  constraint order_items_price_not_negative check (unit_price >= 0 and line_total >= 0)
);

create index order_items_order_idx   on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);


-- -----------------------------------------------------------------------------
-- order_status_history  (timeline del cliente + trazabilidad del admin)
-- -----------------------------------------------------------------------------
create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  changed_by  uuid references public.profiles(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);

create index order_status_history_order_idx
  on public.order_status_history (order_id, created_at);


-- -----------------------------------------------------------------------------
-- payment_proofs  (punto 66) · bucket PRIVADO
-- -----------------------------------------------------------------------------
create table public.payment_proofs (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  storage_path text not null,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  file_size    bigint,
  mime_type    text,
  status       public.proof_status not null default 'pending',
  created_at   timestamptz not null default now(),

  constraint proofs_size_limit check (file_size is null or file_size <= 5 * 1024 * 1024)
);

create index payment_proofs_order_idx on public.payment_proofs (order_id, created_at desc);


-- -----------------------------------------------------------------------------
-- inventory_movements  (punto 58)
--   NINGUNA variacion de stock ocurre sin una fila aqui.
-- -----------------------------------------------------------------------------
create table public.inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  variant_id     uuid not null references public.product_variants(id) on delete cascade,
  movement_type  public.movement_type not null,
  stock_delta    integer not null default 0,
  reserved_delta integer not null default 0,
  stock_after    integer not null,
  reserved_after integer not null,
  order_id       uuid references public.orders(id) on delete set null,
  note           text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint movements_has_effect check (stock_delta <> 0 or reserved_delta <> 0)
);

comment on table public.inventory_movements is
  'Extracto del inventario: cada movimiento con fecha, motivo, autor y saldo resultante.';

create index inventory_movements_variant_idx
  on public.inventory_movements (variant_id, created_at desc);
create index inventory_movements_order_idx
  on public.inventory_movements (order_id) where order_id is not null;
create index inventory_movements_date_idx
  on public.inventory_movements (created_at desc);
