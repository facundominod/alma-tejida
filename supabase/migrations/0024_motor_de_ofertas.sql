-- =============================================================================
-- 0024 - MOTOR DE OFERTAS: REGLAS DENTRO DE UN MOTIVO
--
-- QUE SE PIDIO
-- Una promocion deja de ser un descuento suelto y pasa a ser un MOTIVO -"Dia
-- de la Madre"- que contiene reglas:
--
--   · por cantidad      25 % si llevas mas de dos
--   · por medio de pago 15 % mas si pagas en efectivo
--
-- y los descuentos se ACUMULAN, cosa que hasta ahora no pasaba nunca: la
-- funcion de precio elegia la mejor promocion y descartaba el resto.
--
-- ====================== LAS TRES DECISIONES QUE IMPORTAN ======================
--
-- 1. SE ACUMULAN MULTIPLICANDO, NO SUMANDO.
--    25 % y 15 % sumados dan 40 %. Multiplicados dan 36,25 %: se descuenta el
--    15 % sobre lo que quedo despues del 25 %, que es lo que significa "un
--    descuento mas". Sumar porcentajes ademas permite pasar del 100 % con tres
--    reglas y regalar la pieza; multiplicar no puede llegar nunca a cero.
--
-- 2. SE REDONDEA UNA SOLA VEZ, AL FINAL, Y SOBRE EL PRECIO UNITARIO.
--    Redondear en cada paso acumula el error. Y redondear el total en vez del
--    unitario hace que dos unidades a $172.000 den un total que no es el doble
--    de lo que dice la linea. El orden es: calcular todo, redondear la unidad,
--    multiplicar por la cantidad.
--
-- 3. HAY UNA SOLA IMPLEMENTACION, Y EL PANEL USA ESA MISMA.
--    Es la parte que mas facil se hace mal. El panel necesita mostrar el
--    precio EN VIVO mientras Silvana escribe reglas que todavia no guardo, y
--    la tentacion es escribir una copia del calculo en el navegador. Esa copia
--    y la de verdad empiezan iguales y terminan distintas, y el dia que se
--    separan el panel promete un numero y la tienda cobra otro.
--
--    Por eso `precio_con_reglas()` acepta las reglas por parametro. El panel
--    le pasa las que estan en pantalla sin guardar; la tienda le pasa null y
--    las lee de la base. Mismo codigo, mismo numero.
-- =============================================================================

create table if not exists public.promotion_rules (
  id           uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,

  -- 'cantidad'      -> se aplica si se llevan `min_quantity` o mas
  -- 'medio_de_pago' -> se aplica si se paga con `payment_method`
  kind text not null check (kind in ('cantidad', 'medio_de_pago')),

  min_quantity   integer,
  payment_method text check (
    payment_method is null
    or payment_method in ('transferencia', 'efectivo', 'tarjeta')
  ),

  discount_percent numeric(5,2) not null
    check (discount_percent > 0 and discount_percent < 100),

  position  integer not null default 0,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Cada tipo de regla necesita SU dato y no el del otro. Sin esto se puede
  -- guardar una regla por cantidad sin cantidad, que no se aplica nunca y no
  -- hay forma de darse cuenta mirando la pantalla.
  constraint promotion_rules_cantidad_coherente check (
    kind <> 'cantidad' or (min_quantity is not null and min_quantity >= 2)
  ),
  constraint promotion_rules_pago_coherente check (
    kind <> 'medio_de_pago' or payment_method is not null
  )
);

create index if not exists promotion_rules_promo_idx
  on public.promotion_rules (promotion_id, position);

comment on table public.promotion_rules is
  'Las reglas de un motivo. Se acumulan multiplicando, en el orden que fija precio_con_reglas().';

create trigger promotion_rules_touch
  before update on public.promotion_rules
  for each row execute function public.touch_updated_at();

alter table public.promotion_rules enable row level security;

create policy "promotion_rules_read_all" on public.promotion_rules
  for select to anon, authenticated using (true);

create policy "promotion_rules_admin_all" on public.promotion_rules
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- EL TOPE: hasta donde puede bajar un precio
--
-- Tres reglas acumuladas pueden dejar una pieza en la mitad sin que nadie lo
-- haya decidido. El tope es por tienda y es lo ultimo que se aplica: da igual
-- cuantas reglas entren, el precio no baja de ahi.
-- -----------------------------------------------------------------------------
alter table public.store_settings
  add column if not exists max_discount_percent numeric(5,2) not null default 50;

alter table public.store_settings
  drop constraint if exists store_settings_max_discount_rango;
alter table public.store_settings
  add constraint store_settings_max_discount_rango
  check (max_discount_percent > 0 and max_discount_percent <= 90);

comment on column public.store_settings.max_discount_percent is
  'Tope de descuento acumulado. Ninguna combinacion de reglas puede pasarlo.';


-- -----------------------------------------------------------------------------
-- PARTIR DEL PRECIO DE CONTADO
--
-- Hasta ahora el precio que se carga es el de lista -el de tarjeta- y el de
-- contado sale de restarle el descuento. Silvana pidio poder hacerlo al reves:
-- decidir cuanto quiere recibir en efectivo y que el de lista se calcule hacia
-- arriba.
--
-- Se guarda CUAL de los dos escribio ella. Asi, cuando cambie el porcentaje de
-- contado, se recalcula el otro y no el suyo: si guardaramos solo el resultado,
-- el numero que ella decidio se movería solo.
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists price_basis text not null default 'tarjeta';

alter table public.products
  drop constraint if exists products_price_basis_valido;
alter table public.products
  add constraint products_price_basis_valido
  check (price_basis in ('tarjeta', 'contado'));

comment on column public.products.price_basis is
  'Cual de los dos precios escribio la administradora. El otro se calcula. base_price SIEMPRE guarda el de lista.';
