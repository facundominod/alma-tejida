-- =============================================================================
-- Alma Tejida · 0012 · Storage: tres buckets, tres niveles de acceso
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Publico a proposito: son exactamente las imagenes que queremos que Google
  -- indexe y que WhatsApp muestre al compartir un producto.
  ('catalog', 'catalog', true, 26214400,      -- 25 MB (techo del video)
   array['image/webp','image/jpeg','image/png','image/avif','video/mp4','video/webm']),

  ('brand', 'brand', true, 4194304,           -- 4 MB
   array['image/webp','image/jpeg','image/png','image/svg+xml','image/x-icon','image/vnd.microsoft.icon']),

  -- PRIVADO de verdad. Se accede con URL firmada de 60 segundos, generada en
  -- el servidor tras comprobar quien pide.
  ('receipts', 'receipts', false, 5242880,    -- 5 MB
   array['image/webp','image/jpeg','image/png','application/pdf'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- -----------------------------------------------------------------------------
-- catalog + brand : cualquiera lee, solo el administrador escribe
-- -----------------------------------------------------------------------------
create policy "catalog_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('catalog', 'brand'));

create policy "catalog_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('catalog', 'brand') and public.is_admin());

create policy "catalog_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id in ('catalog', 'brand') and public.is_admin())
  with check (bucket_id in ('catalog', 'brand') and public.is_admin());

create policy "catalog_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('catalog', 'brand') and public.is_admin());


-- -----------------------------------------------------------------------------
-- receipts : el dueno del pedido sube el suyo; nadie mas lo ve
--
--   El prefijo orders/{order_id}/ es lo que impide que un cliente adivine la
--   ruta del comprobante de otro: para leerlo tendria que existir un pedido
--   SUYO con ese id.
-- -----------------------------------------------------------------------------
create policy "receipts_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.orders o
      where o.user_id = auth.uid()
        and name like 'orders/' || o.id::text || '/%'
    )
  );

create policy "receipts_read_owner_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      public.is_admin()
      or exists (
        select 1 from public.orders o
        where o.user_id = auth.uid()
          and name like 'orders/' || o.id::text || '/%'
      )
    )
  );

create policy "receipts_admin_manage" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and public.is_admin());


-- -----------------------------------------------------------------------------
-- Uso de storage, para el panel (punto 142)
--   Se calcula sumando size_bytes, que ya guardamos al subir: es exacto,
--   instantaneo y no consume llamadas a la API de Storage.
-- -----------------------------------------------------------------------------
create or replace function public.storage_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_images bigint;
  v_videos bigint;
  v_proofs bigint;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(sum(size_bytes) filter (where type = 'image'), 0),
         coalesce(sum(size_bytes) filter (where type = 'video'), 0)
    into v_images, v_videos
    from public.product_media;

  select coalesce(sum(file_size), 0) into v_proofs from public.payment_proofs;

  return jsonb_build_object(
    'images_bytes', v_images,
    'videos_bytes', v_videos,
    'proofs_bytes', v_proofs,
    'total_bytes',  v_images + v_videos + v_proofs,
    'quota_bytes',  1073741824,                               -- 1 GB del plan gratuito
    'used_percent', round((v_images + v_videos + v_proofs) * 100.0 / 1073741824, 1)
  );
end;
$$;

grant execute on function public.storage_usage() to authenticated;
