-- =============================================================================
-- Alma Tejida · 0006 · Preguntas, resenas, favoritos, avisos de reposicion
-- =============================================================================

-- -----------------------------------------------------------------------------
-- questions  (puntos 75-79)
--   Nace PRIVADA. Solo pasa a 'published' si el administrador lo decide.
-- -----------------------------------------------------------------------------
create table public.questions (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  author_name text,                                -- para invitados
  body        text not null,
  answer      text,
  answered_at timestamptz,
  answered_by uuid references public.profiles(id) on delete set null,
  status      public.question_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint questions_body_length check (
    length(trim(body)) between 3 and 1000
  ),
  constraint questions_answer_length check (
    answer is null or length(trim(answer)) between 1 and 2000
  ),
  -- no se puede publicar una pregunta sin respuesta
  constraint questions_published_needs_answer check (
    status <> 'published' or (answer is not null and length(trim(answer)) > 0)
  )
);

comment on table public.questions is
  'Texto plano, nunca HTML. Se renderiza con interpolacion de React, que escapa por definicion.';

create index questions_product_public_idx
  on public.questions (product_id, created_at desc) where status = 'published';
create index questions_pending_idx
  on public.questions (created_at desc) where status = 'pending';
create index questions_user_idx on public.questions (user_id, created_at desc);

create trigger questions_touch
  before update on public.questions
  for each row execute function public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- reviews  (puntos 80-83)
--   Compra verificada obligatoria: la FK a order_id + la policy lo garantizan.
-- -----------------------------------------------------------------------------
create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  -- Nombre a mostrar, congelado al momento de resenar.
  -- No se lee de profiles: RLS solo deja ver el perfil propio, asi que un
  -- JOIN devolveria null para las resenas de otras personas. Ademas es un
  -- snapshot: si manana cambia su nombre, la resena vieja no se altera.
  author_name   text,
  rating        smallint not null,
  body          text,
  status        public.review_status not null default 'pending',
  admin_reply   text,
  replied_at    timestamptz,
  hidden_reason text,                              -- por que se oculto (punto 82)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint reviews_rating_range check (rating between 1 and 5),
  constraint reviews_body_length  check (body is null or length(trim(body)) <= 2000),
  -- ocultar una resena exige justificarlo. No se ocultan criticas por ser
  -- negativas (punto 82); si por incumplir las reglas, y queda escrito cual.
  constraint reviews_hidden_needs_reason check (
    status <> 'hidden' or (hidden_reason is not null and length(trim(hidden_reason)) > 0)
  )
);

-- una resena por producto, por pedido, por persona
create unique index reviews_unique_per_purchase
  on public.reviews (user_id, product_id, order_id);
create index reviews_product_approved_idx
  on public.reviews (product_id, created_at desc) where status = 'approved';
create index reviews_pending_idx
  on public.reviews (created_at desc) where status = 'pending';
create index reviews_user_idx on public.reviews (user_id, created_at desc);

create trigger reviews_touch
  before update on public.reviews
  for each row execute function public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- favorites  (punto 186 - arquitectura preparada)
-- -----------------------------------------------------------------------------
create table public.favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index favorites_product_idx on public.favorites (product_id);


-- -----------------------------------------------------------------------------
-- restock_requests  (puntos 184, 185)
--   "Consultar si vuelve". Una consulta simple, no un sistema de marketing.
-- -----------------------------------------------------------------------------
create table public.restock_requests (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  variant_id  uuid references public.product_variants(id) on delete set null,
  user_id     uuid references public.profiles(id) on delete set null,
  email       text not null,
  notified_at timestamptz,
  created_at  timestamptz not null default now(),

  constraint restock_email_shape check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create unique index restock_requests_unique
  on public.restock_requests (product_id, coalesce(variant_id, product_id), lower(email))
  where notified_at is null;
create index restock_requests_pending_idx
  on public.restock_requests (product_id) where notified_at is null;
