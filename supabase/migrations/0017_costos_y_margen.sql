-- =============================================================================
-- 0017 · COSTO POR PIEZA, Y EL MARGEN QUE SALE DE AHÍ
--
-- Hasta acá la tienda sabía a cuánto se vende una pieza y no cuánto cuesta
-- hacerla. Sin eso, el panel puede decir "vendiste $400.000" pero no "ganaste
-- $160.000", que es el número con el que se decide si conviene seguir
-- haciendo respaldos o conviene subir el precio.
--
-- Dos decisiones:
--
-- 1. El costo vive en la VARIANTE, no en el producto. Un respaldo de 1,40 usa
--    menos lana que uno de 1,90: son costos distintos. `products.base_cost`
--    existe como valor por defecto para no tener que cargarlo mil veces.
--
-- 2. El costo se CONGELA en cada línea de pedido, igual que el precio. Si
--    dentro de seis meses sube la lana, el margen de las ventas de hoy tiene
--    que seguir siendo el de hoy. Un informe que cambia solo no es un informe.
--
-- El costo NUNCA sale a la tienda: `v_catalog_products` no lo incluye y las
-- políticas de RLS de `product_variants` ya limitan la escritura a quien
-- administra. Lo que hay que cuidar es que ninguna consulta pública lo pida.
-- =============================================================================

alter table public.products
  add column if not exists base_cost numeric(12,2);

alter table public.product_variants
  add column if not exists cost numeric(12,2);

comment on column public.products.base_cost is
  'Cuanto cuesta hacerla, por defecto. Nunca sale a la tienda publica.';
comment on column public.product_variants.cost is
  'Costo de esta combinacion. Si es nulo, se usa products.base_cost.';

alter table public.products
  drop constraint if exists products_base_cost_no_negativo;
alter table public.products
  add constraint products_base_cost_no_negativo
  check (base_cost is null or base_cost >= 0);

alter table public.product_variants
  drop constraint if exists product_variants_cost_no_negativo;
alter table public.product_variants
  add constraint product_variants_cost_no_negativo
  check (cost is null or cost >= 0);


-- -----------------------------------------------------------------------------
-- El costo del momento, congelado en el pedido
--
-- Igual que unit_price: lo que se guarda es cuanto costaba ESA pieza ESE dia.
-- -----------------------------------------------------------------------------
alter table public.order_items
  add column if not exists unit_cost numeric(12,2);

comment on column public.order_items.unit_cost is
  'Costo unitario al momento de la venta. Congelado: el margen de ayer no cambia manana.';


-- -----------------------------------------------------------------------------
-- Resumen para el panel
--
-- Devuelve lo vendido y lo ganado en un rango, y el detalle por pieza.
-- `security definer` + solo admin: el costo es informacion de adentro.
-- -----------------------------------------------------------------------------
create or replace function public.admin_margenes(
  p_desde date default (current_date - 29),
  p_hasta date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_resumen jsonb;
  v_piezas  jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  -- Solo pedidos cobrados: un pedido pendiente todavia no es una ganancia.
  with vendido as (
    select
      oi.product_id,
      oi.product_name,
      oi.quantity,
      oi.unit_price,
      coalesce(oi.unit_cost, 0) as unit_cost
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status in ('paid', 'preparing', 'delivered')
      and o.created_at::date between p_desde and p_hasta
  )
  select
    jsonb_build_object(
      'unidades',  coalesce(sum(quantity), 0),
      'ingresos',  coalesce(sum(quantity * unit_price), 0),
      'costos',    coalesce(sum(quantity * unit_cost), 0),
      'ganancia',  coalesce(sum(quantity * (unit_price - unit_cost)), 0),
      -- Sin costos cargados el margen seria 100%, que es mentira. Se devuelve
      -- nulo y el panel dice "falta cargar costos" en lugar de un numero lindo.
      'margen',    case
                     when coalesce(sum(quantity * unit_price), 0) = 0 then null
                     when coalesce(sum(quantity * unit_cost), 0) = 0 then null
                     else round(
                       100.0 * sum(quantity * (unit_price - unit_cost))
                             / sum(quantity * unit_price), 1)
                   end
    )
  into v_resumen
  from vendido;

  with vendido as (
    select
      oi.product_id,
      max(oi.product_name) as product_name,
      sum(oi.quantity)     as unidades,
      sum(oi.quantity * oi.unit_price)                        as ingresos,
      sum(oi.quantity * coalesce(oi.unit_cost, 0))            as costos
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status in ('paid', 'preparing', 'delivered')
      and o.created_at::date between p_desde and p_hasta
    group by oi.product_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', product_id,
      'nombre',     product_name,
      'unidades',   unidades,
      'ingresos',   ingresos,
      'costos',     costos,
      'ganancia',   ingresos - costos,
      'margen',     case
                      when ingresos = 0 or costos = 0 then null
                      else round(100.0 * (ingresos - costos) / ingresos, 1)
                    end
    )
    order by (ingresos - costos) desc
  ), '[]'::jsonb)
  into v_piezas
  from vendido;

  return jsonb_build_object('resumen', v_resumen, 'piezas', v_piezas);
end;
$$;

revoke all on function public.admin_margenes(date, date) from public, anon;
grant execute on function public.admin_margenes(date, date) to authenticated;


-- -----------------------------------------------------------------------------
-- Congelar el costo al vender
--
-- Un disparador y no una reescritura de create_order(): esa funcion son
-- cuatrocientas lineas y copiarlas enteras para agregar una columna deja dos
-- versiones de la misma logica esperando desincronizarse.
--
-- Asi ademas el costo queda congelado venga el insert de donde venga, no solo
-- del camino principal.
-- -----------------------------------------------------------------------------
create or replace function public.congelar_costo_en_el_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.unit_cost is null and new.variant_id is not null then
    select coalesce(v.cost, p.base_cost)
      into new.unit_cost
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = new.variant_id;
  end if;

  return new;
end;
$$;

drop trigger if exists order_items_congelar_costo on public.order_items;

create trigger order_items_congelar_costo
  before insert on public.order_items
  for each row execute function public.congelar_costo_en_el_pedido();
