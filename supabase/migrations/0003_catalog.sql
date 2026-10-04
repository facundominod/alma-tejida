-- =============================================================================
-- Alma Tejida · 0003 · Catalogo: productos, atributos dinamicos, variantes, media
-- =============================================================================

-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------
create table public.products (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid references public.categories(id) on delete set null,

  name              text not null,
  slug              text not null,
  short_description text,
  description       text,

  status            public.product_status not null default 'draft',
  availability_mode public.availability_mode not null default 'in_stock',
  lead_time_days    integer,                       -- tiempo de elaboracion (punto 43)

  -- precio (punto 44). El precio de una combinacion puntual se sobrescribe
  -- en product_variants.price_override (punto 45).
  base_price        numeric(12,2) not null,
  sale_price        numeric(12,2),
  sale_starts_at    timestamptz,
  sale_ends_at      timestamptz,

  -- politica de visualizacion de stock (punto 56)
  stock_display       public.stock_display_mode not null default 'vague',
  low_stock_threshold integer not null default 2,
  show_when_out_of_stock boolean not null default true,   -- punto 184

  -- destacados (puntos 182, 183)
  is_featured       boolean not null default false,
  featured_position integer not null default 0,

  -- calificaciones agregadas, mantenidas por trigger (punto 83)
  rating_avg        numeric(3,2) not null default 0,
  rating_count      integer not null default 0,

  -- busqueda (punto 32). Se mantiene por trigger porque incluye datos de
  -- otras tablas (categoria y valores de atributo), cosa que una columna
  -- generada no puede hacer.
  search_vector     tsvector,

  published_at      timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint products_name_not_blank   check (length(trim(name)) > 0),
  constraint products_base_price_positive check (base_price >= 0),
  constraint products_sale_below_base  check (sale_price is null or sale_price < base_price),
  constraint products_sale_range       check (
    sale_starts_at is null or sale_ends_at is null or sale_ends_at > sale_starts_at
  ),
  constraint products_lead_time_positive check (lead_time_days is null or lead_time_days > 0),
  constraint products_threshold_positive check (low_stock_threshold >= 0),
  constraint products_rating_range     check (rating_avg >= 0 and rating_avg <= 5),
  -- un producto a pedido deberia declarar cuanto tarda; no se obliga, pero
  -- si declara lead_time, tiene que ser porque es a pedido
  constraint products_lead_time_only_made_to_order check (
    lead_time_days is null or availability_mode = 'made_to_order'
  )
);

comment on column public.products.search_vector is
  'Mantenido por refresh_product_search(). Incluye nombre, descripciones, categoria y valores de atributo.';

create unique index products_slug_key on public.products (slug) where deleted_at is null;
create index products_status_published_idx on public.products (status, published_at desc)
  where deleted_at is null;
create index products_category_idx on public.products (category_id)
  where status = 'published' and deleted_at is null;
create index products_featured_idx on public.products (featured_position)
  where is_featured and status = 'published' and deleted_at is null;
create index products_search_idx on public.products using gin (search_vector);
create index products_name_trgm_idx on public.products
  using gin (public.at_unaccent(name) extensions.gin_trgm_ops);

create trigger products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- product_attributes / product_attribute_values
--   El corazon del punto 35: cada producto define SUS caracteristicas.
--   No existe una columna "color" ni "talle" en ninguna tabla.
-- -----------------------------------------------------------------------------
create table public.product_attributes (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name       text not null,                        -- "Color", "Medida", "Tipo de lana"
  type       public.attribute_type not null default 'select',
  position   integer not null default 0,
  created_at timestamptz not null default now(),

  constraint product_attributes_name_not_blank check (length(trim(name)) > 0)
);

create unique index product_attributes_unique_name
  on public.product_attributes (product_id, lower(name));
create index product_attributes_product_idx
  on public.product_attributes (product_id, position);


create table public.product_attribute_values (
  id           uuid primary key default gen_random_uuid(),
  attribute_id uuid not null references public.product_attributes(id) on delete cascade,
  value        text not null,                      -- "Crudo", "1,50 x 2,00"
  color_hex    text,                               -- solo para type = 'color'
  position     integer not null default 0,
  created_at   timestamptz not null default now(),

  constraint pav_value_not_blank check (length(trim(value)) > 0),
  constraint pav_color_format check (color_hex is null or color_hex ~* '^#[0-9a-f]{6}$')
);

create unique index pav_unique_value
  on public.product_attribute_values (attribute_id, lower(value));
create index pav_attribute_idx
  on public.product_attribute_values (attribute_id, position);


-- -----------------------------------------------------------------------------
-- product_variants
--   TODO producto tiene al menos una variante (decision D1).
--   El stock vive aqui y solo aqui.
-- -----------------------------------------------------------------------------
create table public.product_variants (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products(id) on delete cascade,
  sku                 text,
  price_override      numeric(12,2),               -- solo si esta combinacion cuesta distinto
  stock               integer not null default 0,  -- piezas fisicas en el taller
  reserved            integer not null default 0,  -- comprometidas en pedidos no cobrados
  low_stock_threshold integer,                     -- null => hereda del producto
  is_default          boolean not null default false,
  is_active           boolean not null default true,
  position            integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint variants_stock_not_negative    check (stock >= 0),
  constraint variants_reserved_not_negative check (reserved >= 0),
  -- no se puede reservar mas de lo que existe fisicamente
  constraint variants_reserved_within_stock check (reserved <= stock),
  constraint variants_price_positive        check (price_override is null or price_override >= 0),
  constraint variants_threshold_positive    check (low_stock_threshold is null or low_stock_threshold >= 0)
);

comment on column public.product_variants.stock is
  'Piezas fisicas. Solo baja cuando el pago se confirma, nunca al crear el pedido.';
comment on column public.product_variants.reserved is
  'Comprometidas en pedidos no cobrados. disponible = stock - reserved.';

-- una sola variante por defecto por producto
create unique index variants_one_default_per_product
  on public.product_variants (product_id) where is_default;
create unique index variants_sku_key
  on public.product_variants (product_id, lower(sku)) where sku is not null;
create index variants_product_idx
  on public.product_variants (product_id, position);
create index variants_low_stock_idx
  on public.product_variants (product_id)
  where is_active and (stock - reserved) <= 2;

create trigger variants_touch
  before update on public.product_variants
  for each row execute function public.touch_updated_at();


-- Que combinacion es cada variante.
-- PK compuesta: una variante no puede tener dos colores.
create table public.variant_option_values (
  variant_id   uuid not null references public.product_variants(id) on delete cascade,
  attribute_id uuid not null references public.product_attributes(id) on delete cascade,
  value_id     uuid not null references public.product_attribute_values(id) on delete cascade,
  primary key (variant_id, attribute_id)
);

create index vov_value_idx on public.variant_option_values (value_id);


-- -----------------------------------------------------------------------------
-- product_media
-- -----------------------------------------------------------------------------
create table public.product_media (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products(id) on delete cascade,
  -- una foto puede pertenecer a una variante concreta, o a un VALOR de atributo
  -- ("estas son las verdes", punto 105). Ambos opcionales.
  variant_id         uuid references public.product_variants(id) on delete set null,
  attribute_value_id uuid references public.product_attribute_values(id) on delete set null,

  type               public.media_type not null default 'image',
  storage_path       text not null,                -- ruta en el bucket 'catalog'
  thumb_path         text,                         -- derivado 480px
  blur_data          text,                         -- LQIP 24px en base64, embebido
  external_url       text,                         -- reservado: migracion a CDN de video
  alt                text,
  width              integer,
  height             integer,
  size_bytes         bigint,
  duration_seconds   integer,                      -- solo video
  position           integer not null default 0,
  is_cover           boolean not null default false,
  created_at         timestamptz not null default now(),

  constraint media_size_positive check (size_bytes is null or size_bytes > 0),
  constraint media_video_duration check (
    type <> 'video' or duration_seconds is null or duration_seconds <= 45
  ),
  constraint media_has_source check (
    length(trim(storage_path)) > 0 or length(trim(coalesce(external_url, ''))) > 0
  )
);

create unique index media_one_cover_per_product
  on public.product_media (product_id) where is_cover;
create index media_product_idx   on public.product_media (product_id, position);
create index media_variant_idx   on public.product_media (variant_id) where variant_id is not null;
create index media_value_idx     on public.product_media (attribute_value_id) where attribute_value_id is not null;
-- un solo video por producto (cuota de egreso, ver docs/03-STORAGE.md)
create unique index media_one_video_per_product
  on public.product_media (product_id) where type = 'video';


-- -----------------------------------------------------------------------------
-- price_history  (punto 46)
-- -----------------------------------------------------------------------------
create table public.price_history (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  field      text not null,                        -- 'base_price' | 'sale_price' | 'price_override'
  old_price  numeric(12,2),
  new_price  numeric(12,2),
  changed_by uuid references public.profiles(id) on delete set null,
  reason     text,
  created_at timestamptz not null default now()
);

create index price_history_product_idx on public.price_history (product_id, created_at desc);
