-- =============================================================================
-- 0020 - QUEDA ESCRITO QUE FOTO LLEVA MARCA DE AGUA
--
-- EL PROBLEMA
-- Las fotos que se subieron antes de que existiera la marca de agua no la
-- tienen, y no hay forma de saber mirando el archivo si la lleva o no.
--
-- POR QUE NO SE ARREGLA CON UN SCRIPT QUE LAS VUELVA A ESTAMPAR
-- Por dos razones, y la segunda es la que decide:
--
--   1. No se guarda el original (es una regla explicita del modulo de fotos:
--      ocupa cuota del plan gratuito y nunca se vuelve a usar). Lo unico que
--      hay es el webp ya comprimido, y volver a comprimirlo pierde calidad
--      otra vez -justamente la queja que hubo con las primeras subidas-.
--
--   2. Sobre una foto que YA tiene marca, estamparla de nuevo deja dos. Y como
--      no se puede distinguir una de otra, el script no tiene forma de saber a
--      cual aplicarsela sin arruinar las demas.
--
-- QUE SE HACE EN CAMBIO
-- Se anota. De ahora en adelante cada foto queda marcada como estampada, y el
-- panel puede mostrar cuales son las que faltan para volver a subir ESAS y
-- ninguna otra. Es mas trabajo manual que un script, pero no toca una sola
-- foto que ya este bien.
--
-- Las filas que ya existen quedan en nulo, que es la verdad: ninguna de las
-- que estan hoy tiene marca.
-- =============================================================================

alter table public.product_media
  add column if not exists watermarked_at timestamptz;

comment on column public.product_media.watermarked_at is
  'Cuando se le estampo la marca de agua. Nulo = no la tiene, hay que volver a subirla.';

-- Para que el panel pueda listar las que faltan sin recorrer todo.
create index if not exists product_media_sin_marca_idx
  on public.product_media (product_id)
  where watermarked_at is null and type = 'image';
