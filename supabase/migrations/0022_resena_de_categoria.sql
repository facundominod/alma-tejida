-- =============================================================================
-- 0022 - LA RESENA DE UNA CATEGORIA NO ES SU DESCRIPCION
--
-- EL PROBLEMA
-- `categories.description` hacia dos trabajos a la vez: era la descripcion que
-- lee Google -que tiene que andar por los 155 caracteres o la corta- y tambien
-- el texto que se muestra al entrar a la categoria.
--
-- Son dos textos distintos y tiran para lados opuestos. La descripcion para
-- buscadores quiere ser corta y con las palabras clave; la presentacion de la
-- pagina quiere contar de que esta hecha la pieza, que medidas hay y por que
-- vale la pena quedarse mirando. Con un solo campo, escribir una bien significa
-- arruinar la otra: hoy hay tres descripciones de una linea -"Respaldos de cama
-- tejidos a mano, a medida."- que como presentacion no dicen nada.
--
-- LA SOLUCION
-- `description` se queda con su trabajo de siempre, el de los buscadores.
-- `intro` es la presentacion: puede ser larga, puede tener varias frases, y no
-- le importa el largo porque no la lee ningun robot.
--
-- Nada se migra de una columna a la otra: las que estan son buenas
-- descripciones cortas y malas presentaciones. Que `intro` arranque vacia es la
-- verdad, y el panel marca cuales faltan.
-- =============================================================================

alter table public.categories
  add column if not exists intro text;

comment on column public.categories.intro is
  'La presentacion que se lee al entrar a la categoria. Nulo = la pagina abre directo en las piezas.';

comment on column public.categories.description is
  'Descripcion corta para buscadores y redes. Para el texto de la pagina, usar intro.';

alter table public.categories
  drop constraint if exists categories_intro_largo;
alter table public.categories
  add constraint categories_intro_largo
  check (intro is null or length(intro) <= 2000);
