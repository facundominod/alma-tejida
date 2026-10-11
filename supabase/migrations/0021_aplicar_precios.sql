-- =============================================================================
-- 0021 - APLICAR UNA TANDA DE PRECIOS, TODO O NADA
--
-- POR QUE EXISTE
-- Para poder dejar todos los precios del catalogo terminados en 99 de una vez.
-- La REGLA de redondeo no vive aca: vive en TypeScript, en `src/lib/redondeo.ts`,
-- con sus pruebas. Aca llega la lista ya calculada de (id, precio) y lo unico
-- que se hace es escribirla.
--
-- Esa division es a proposito. La regla tiene casos -el piso que protege a las
-- piezas con precio provisorio, el redondeo a la centena mas cercana, que hacer
-- si ya termina en 99- y se prueba mucho mejor en TypeScript que en SQL. Lo que
-- SQL hace bien es lo otro: escribir cuarenta filas o ninguna.
--
-- POR QUE TODO O NADA
-- Una tanda de precios aplicada a medias es peor que una que no se aplico:
-- quedan unas piezas con el precio nuevo y otras con el viejo, y no hay forma
-- de saber cuales sin revisarlas una por una. Si una fila falla -por ejemplo
-- porque bajar el precio de lista lo dejaria por debajo de su precio
-- promocional, que un CHECK no permite- no se escribe ninguna.
--
-- VALIDACION
-- Es SECURITY DEFINER para poder escribir, asi que lo PRIMERO que hace es
-- comprobar que quien llama sea administradora. Sin eso, cualquiera con la
-- clave publica podria reescribir todos los precios de la tienda.
-- =============================================================================

create or replace function public.admin_aplicar_precios(
  p_productos jsonb default '[]'::jsonb,
  p_variantes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_productos integer := 0;
  v_variantes integer := 0;
  v_fila      record;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- Las piezas. `sale_price` viaja junto con el precio de lista porque los dos
  -- se redondean a la vez: si se escribiera solo uno, el CHECK
  -- products_sale_below_base podria rechazar la fila.
  for v_fila in
    select (x->>'id')::uuid as id,
           (x->>'precio')::numeric(12,2) as precio,
           case when x ? 'oferta' and x->>'oferta' is not null
                then (x->>'oferta')::numeric(12,2) end as oferta
      from jsonb_array_elements(coalesce(p_productos, '[]'::jsonb)) as x
  loop
    update public.products
       set base_price = v_fila.precio,
           sale_price = coalesce(v_fila.oferta, sale_price)
     where id = v_fila.id
       and deleted_at is null;

    if found then
      v_productos := v_productos + 1;
    end if;
  end loop;

  -- Las combinaciones que tienen su propio precio.
  for v_fila in
    select (x->>'id')::uuid as id,
           (x->>'precio')::numeric(12,2) as precio
      from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb)) as x
  loop
    update public.product_variants
       set price_override = v_fila.precio
     where id = v_fila.id;

    if found then
      v_variantes := v_variantes + 1;
    end if;
  end loop;

  return jsonb_build_object('productos', v_productos, 'variantes', v_variantes);
end;
$$;

comment on function public.admin_aplicar_precios(jsonb, jsonb) is
  'Escribe una tanda de precios ya calculados, todo o nada. La regla de redondeo vive en src/lib/redondeo.ts.';

revoke all on function public.admin_aplicar_precios(jsonb, jsonb) from public;
grant execute on function public.admin_aplicar_precios(jsonb, jsonb) to authenticated;
