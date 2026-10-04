-- =============================================================================
-- Alma Tejida · 0004 · Promociones dinamicas (puntos 24-26, 106, 109)
--   Cero banners hardcodeados: el home lee de aqui.
-- =============================================================================

create table public.promotions (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  image_path     text,

  discount_type  public.discount_type not null default 'percent',
  discount_value numeric(12,2) not null,

  starts_at      timestamptz,
  ends_at        timestamptz,
  is_active      boolean not null default true,

  -- presentacion en el home (puntos 24, 26)
  show_in_hero   boolean not null default true,
  position       integer not null default 0,
  cta_label      text,
  cta_href       text,

  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint promotions_title_not_blank check (length(trim(title)) > 0),
  constraint promotions_value_positive  check (discount_value > 0),
  constraint promotions_percent_range   check (
    discount_type <> 'percent' or discount_value <= 100
  ),
  constraint promotions_range check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

create index promotions_active_idx
  on public.promotions (position, starts_at)
  where is_active;

create trigger promotions_touch
  before update on public.promotions
  for each row execute function public.touch_updated_at();


-- A que alcanza la promocion. Exactamente un destino por fila.
create table public.promotion_targets (
  id           uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  product_id   uuid references public.products(id) on delete cascade,
  category_id  uuid references public.categories(id) on delete cascade,

  constraint promotion_targets_exactly_one check (
    (product_id is not null)::int + (category_id is not null)::int = 1
  )
);

create unique index promotion_targets_product_key
  on public.promotion_targets (promotion_id, product_id) where product_id is not null;
create unique index promotion_targets_category_key
  on public.promotion_targets (promotion_id, category_id) where category_id is not null;
create index promotion_targets_product_idx  on public.promotion_targets (product_id);
create index promotion_targets_category_idx on public.promotion_targets (category_id);


-- Vista de conveniencia: promociones vigentes AHORA.
-- Una promocion "activa" con fecha futura o vencida no es vigente.
create or replace view public.v_active_promotions as
select p.*
from public.promotions p
where p.is_active
  and (p.starts_at is null or p.starts_at <= now())
  and (p.ends_at   is null or p.ends_at   >= now());
