-- =============================================================================
-- 0026 - EL HISTORIAL DE PRECIOS NO PODIA ESCRIBIRSE, Y ESO IMPEDIA GUARDAR
--
-- EL SINTOMA
-- "No pudimos guardar los cambios. permission denied for table price_history"
-- al editar el precio de una pieza. Cualquier otro campo guardaba bien.
--
-- LA CAUSA
-- `price_history` es un registro de auditoria: en 0011 se le revoco todo a
-- `authenticated` y se le devolvio SOLO `select`. Correcto, porque nadie tiene
-- que poder escribir a mano en un historial.
--
-- Pero los dos disparadores que lo llenan -trg_log_product_price y
-- trg_log_variant_price- se crearon SIN `security definer`, asi que corren con
-- los permisos de quien edita. Ese rol puede leer el historial y no escribirlo,
-- asi que el INSERT del disparador fallaba y se llevaba puesto el UPDATE
-- entero.
--
-- Los disparadores se disparan `after update of base_price, sale_price` y
-- `of price_override`: por eso fallaba EXACTAMENTE al tocar un precio y nada
-- mas. Desde que existe el historial, cambiar un precio era imposible.
--
-- LA SOLUCION, Y POR QUE ESTA Y NO LA OTRA
-- Se podria dar `insert` sobre `price_history` a `authenticated`. No: un
-- registro de auditoria en el que el auditado puede escribir filas a mano no
-- sirve para nada. Lo que corresponde es que el disparador -el unico escritor
-- legitimo- corra con los permisos del dueno.
--
-- `set search_path` va junto con `security definer` siempre: sin eso, quien
-- llama puede anteponer un esquema propio y hacer que `public.price_history`
-- apunte a otra tabla.
-- =============================================================================

create or replace function public.trg_log_product_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

create or replace function public.trg_log_variant_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.price_override is distinct from old.price_override then
    insert into public.price_history (product_id, variant_id, field, old_price, new_price, changed_by)
    values (new.product_id, new.id, 'price_override', old.price_override, new.price_override, auth.uid());
  end if;
  return null;
end;
$$;

comment on function public.trg_log_product_price() is
  'security definer a proposito: el historial no se puede escribir a mano, y este disparador es su unico escritor legitimo.';
comment on function public.trg_log_variant_price() is
  'security definer a proposito: ver trg_log_product_price().';
