-- =============================================================================
-- 0023 - PREGUNTAR SIN TENER CUENTA
--
-- EL PROBLEMA
-- Para preguntar algo sobre una pieza habia que crear una cuenta. Nadie crea
-- una cuenta para preguntar si un respaldo entra en su cama: se va. Y el
-- pedido ya se podia hacer sin cuenta, asi que la pregunta -que es el paso
-- ANTERIOR, el mas barato de todos- era el unico con esa traba.
--
-- POR QUE UNA FUNCION Y NO ABRIR LA TABLA
-- Dejar que `anon` inserte en `questions` seria dejar que cualquiera escriba
-- filas con el estado, el autor y la respuesta que quiera. La funcion recibe
-- solo lo que corresponde -producto, texto, nombre y contacto-, pone el estado
-- ella, y limita cuantas se pueden mandar.
--
-- DOS LIMITES, NO UNO
-- Uno por visitante, que resuelve el caso normal. Y uno para toda la tienda,
-- porque el token del visitante lo manda el navegador y se puede cambiar: sin
-- el segundo limite, un script que rota el token escribe sin tope.
--
-- LA RESPUESTA SE PUBLICA APARTE DE LA PREGUNTA
-- Son dos decisiones distintas y hasta ahora eran una sola. Hay respuestas que
-- solo le sirven a quien pregunto -un precio especial, una fecha concreta- y
-- preguntas que vale la pena dejar a la vista aunque la respuesta sea privada.
-- =============================================================================

alter table public.questions
  add column if not exists author_contact text;

alter table public.questions
  add column if not exists answer_is_public boolean not null default false;

comment on column public.questions.author_contact is
  'WhatsApp o correo de quien pregunta sin cuenta. Es la unica forma de contestarle en privado.';
comment on column public.questions.answer_is_public is
  'Si la RESPUESTA se ve en la ficha. Se decide aparte de publicar la pregunta.';

alter table public.questions
  drop constraint if exists questions_contact_largo;
alter table public.questions
  add constraint questions_contact_largo
  check (author_contact is null or length(trim(author_contact)) between 3 and 160);

-- Una respuesta publica necesita una respuesta escrita. Sin esto, tildar la
-- casilla antes de escribir dejaria la ficha mostrando un hueco.
alter table public.questions
  drop constraint if exists questions_respuesta_publica_necesita_respuesta;
alter table public.questions
  add constraint questions_respuesta_publica_necesita_respuesta
  check (
    not answer_is_public or (answer is not null and length(trim(answer)) > 0)
  );


-- -----------------------------------------------------------------------------
-- Lo que se ve en la ficha
--
-- RLS filtra FILAS, no columnas: si la fila se puede leer, la respuesta
-- tambien. Para poder mostrar una pregunta publica con la respuesta en privado
-- hace falta una vista que vacie esa columna.
--
-- `security_invoker` queda en TRUE: la vista no sirve para saltear RLS, sirve
-- para tapar una columna. Lo que se puede leer lo siguen decidiendo las
-- politicas de la tabla.
-- -----------------------------------------------------------------------------
create or replace view public.v_public_questions
with (security_invoker = true) as
select
  q.id,
  q.product_id,
  q.author_name,
  q.body,
  case when q.answer_is_public then q.answer end as answer,
  case when q.answer_is_public then q.answered_at end as answered_at,
  q.answer is not null as fue_respondida,
  q.answer_is_public,
  q.created_at
from public.questions q
where q.status = 'published';

comment on view public.v_public_questions is
  'Las preguntas publicadas. La respuesta sale en blanco si no se publico, y por eso esto es una vista y no un select a la tabla.';

grant select on public.v_public_questions to anon, authenticated;


-- -----------------------------------------------------------------------------
-- Preguntar
-- -----------------------------------------------------------------------------
create or replace function public.preguntar(
  p_product_id     uuid,
  p_body           text,
  p_author_name    text default null,
  p_author_contact text default null,
  -- El token que el navegador ya guarda para el carrito. Sirve para contar
  -- cuantas mando la misma persona; no identifica a nadie.
  p_visitante      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_body     text := trim(coalesce(p_body, ''));
  v_nombre   text := nullif(trim(coalesce(p_author_name, '')), '');
  v_contacto text := nullif(trim(coalesce(p_author_contact, '')), '');
  v_quien    text;
  v_ok       boolean;
  v_existe   boolean;
begin
  if length(v_body) < 3 or length(v_body) > 1000 then
    raise exception 'PREGUNTA_INVALIDA' using errcode = 'P0001';
  end if;

  -- Solo sobre piezas que estan a la venta. Sin esto se podrian dejar
  -- preguntas sobre borradores que nadie puede ver.
  select exists (
    select 1 from public.products
     where id = p_product_id and deleted_at is null and status = 'published'
  ) into v_existe;

  if not v_existe then
    raise exception 'PIEZA_INEXISTENTE' using errcode = 'P0001';
  end if;

  v_quien := coalesce(auth.uid()::text, nullif(trim(coalesce(p_visitante, '')), ''), 'anonimo');

  -- Cinco por hora por visitante: de sobra para cualquiera que este decidiendo
  -- una compra, poco para llenarle la bandeja a Silvana.
  select public.check_rate_limit('pregunta:' || v_quien, 5, 3600) into v_ok;
  if v_ok is false then
    raise exception 'DEMASIADAS_PREGUNTAS' using errcode = 'P0001';
  end if;

  -- Y un tope para toda la tienda. El token del visitante lo manda el
  -- navegador: sin este segundo limite, rotarlo deja escribir sin freno.
  select public.check_rate_limit('pregunta:tienda', 60, 3600) into v_ok;
  if v_ok is false then
    raise exception 'DEMASIADAS_PREGUNTAS' using errcode = 'P0001';
  end if;

  insert into public.questions (
    product_id, user_id, author_name, author_contact, body, status
  ) values (
    p_product_id,
    auth.uid(),
    v_nombre,
    v_contacto,
    v_body,
    'pending'
  );

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.preguntar(uuid, text, text, text, text) is
  'Deja una pregunta sin necesidad de cuenta. Pone el estado ella y limita por visitante y por tienda.';

revoke all on function public.preguntar(uuid, text, text, text, text) from public;
grant execute on function public.preguntar(uuid, text, text, text, text) to anon, authenticated;
