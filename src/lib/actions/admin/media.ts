'use server'

import 'server-only'

import { revalidatePath } from 'next/cache'
import sharp from 'sharp'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/server'
import { IMAGE_DERIVATIVES, UPLOAD_LIMITS } from '@/lib/images'

/**
 * Subida y procesamiento de multimedia.
 *
 * LA REGLA: nunca se guarda el original.
 *
 * Una foto de celular (4032x3024, ~4,5 MB) se convierte en ~180 KB de imagen
 * principal + ~22 KB de miniatura. Reducción del 96 %. Con 1 GB de plan
 * gratuito, eso es la diferencia entre ~200 productos y ~4.000
 * (ver docs/03-STORAGE.md).
 *
 * El placeholder borroso de 24px va EMBEBIDO en la base como base64: no
 * cuesta ni una petición extra.
 */

export type MediaResult = { ok: true; mediaId: string } | { ok: false; error: string }

const uploadSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullish(),
  attributeValueId: z.string().uuid().nullish(),
  alt: z.string().trim().max(200).optional(),
})

export async function uploadProductImage(formData: FormData): Promise<MediaResult> {
  await requireAdmin()

  const parsed = uploadSchema.safeParse({
    productId: formData.get('productId'),
    variantId: formData.get('variantId') || null,
    attributeValueId: formData.get('attributeValueId') || null,
    alt: formData.get('alt') || undefined,
  })

  if (!parsed.success) return { ok: false, error: 'Faltan datos de la imagen.' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No llego ningun archivo.' }

  if (file.size > UPLOAD_LIMITS.image.maxBytes) {
    return { ok: false, error: 'La imagen supera los 8 MB.' }
  }

  const admin = createAdminClient()

  // La cuota se valida EN EL SERVIDOR contando filas reales, no confiando en
  // lo que el formulario diga (punto 141).
  const { count } = await admin
    .from('product_media')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', parsed.data.productId)
    .eq('type', 'image')

  if ((count ?? 0) >= UPLOAD_LIMITS.image.maxPerProduct) {
    return {
      ok: false,
      error: `Ya hay ${UPLOAD_LIMITS.image.maxPerProduct} fotos en esta pieza. Borra alguna para subir otra.`,
    }
  }

  try {
    const input = Buffer.from(await file.arrayBuffer())

    // sharp lee la cabecera real del archivo: renombrar un .exe a .jpg no
    // pasa de acá.
    const metadata = await sharp(input).metadata()
    if (!metadata.width || !metadata.height) {
      return { ok: false, error: 'No pudimos leer la imagen. Probá con otro archivo.' }
    }

    const mediaId = crypto.randomUUID()
    const base = `products/${parsed.data.productId}/${mediaId}`

    // `rotate()` sin argumentos aplica la orientación EXIF: sin esto, las
    // fotos verticales de celular salen acostadas.
    const pipeline = () => sharp(input).rotate()

    const [main, thumb, micro] = await Promise.all([
      pipeline()
        .resize({
          width: IMAGE_DERIVATIVES.main.maxSide,
          height: IMAGE_DERIVATIVES.main.maxSide,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: IMAGE_DERIVATIVES.main.quality })
        .toBuffer({ resolveWithObject: true }),
      pipeline()
        .resize({
          width: IMAGE_DERIVATIVES.thumb.maxSide,
          height: IMAGE_DERIVATIVES.thumb.maxSide,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: IMAGE_DERIVATIVES.thumb.quality })
        .toBuffer(),
      pipeline()
        .resize({ width: IMAGE_DERIVATIVES.micro.maxSide })
        .webp({ quality: IMAGE_DERIVATIVES.micro.quality })
        .toBuffer(),
    ])

    const mainPath = `${base}.webp`
    const thumbPath = `${base}@thumb.webp`

    const [mainUpload, thumbUpload] = await Promise.all([
      admin.storage.from('catalog').upload(mainPath, main.data, {
        contentType: 'image/webp',
        upsert: true,
      }),
      admin.storage.from('catalog').upload(thumbPath, thumb, {
        contentType: 'image/webp',
        upsert: true,
      }),
    ])

    if (mainUpload.error || thumbUpload.error) {
      return { ok: false, error: 'No pudimos guardar la imagen.' }
    }

    const { data: inserted, error } = await admin
      .from('product_media')
      .insert({
        id: mediaId,
        product_id: parsed.data.productId,
        variant_id: parsed.data.variantId ?? null,
        attribute_value_id: parsed.data.attributeValueId ?? null,
        type: 'image',
        storage_path: mainPath,
        thumb_path: thumbPath,
        blur_data: `data:image/webp;base64,${micro.toString('base64')}`,
        alt: parsed.data.alt ?? null,
        width: main.info.width,
        height: main.info.height,
        size_bytes: main.info.size + thumb.byteLength,
        position: count ?? 0,
        // La primera foto que se sube es la portada
        is_cover: (count ?? 0) === 0,
      })
      .select('id')
      .single()

    if (error || !inserted) {
      // No dejamos archivos huerfanos ocupando la cuota
      await admin.storage.from('catalog').remove([mainPath, thumbPath])
      return { ok: false, error: 'No pudimos registrar la imagen.' }
    }

    revalidatePath(`/admin/productos/${parsed.data.productId}`)
    return { ok: true, mediaId: inserted.id }
  } catch {
    return { ok: false, error: 'El archivo no parece una imagen válida.' }
  }
}

/**
 * Video: un solo archivo por producto, 25 MB y 45 segundos.
 *
 * El límite no es por el storage sino por el EGRESO: el plan gratuito da
 * 5 GB/mes, y 600 reproducciones de un video de 8 MB lo agotan y tiran abajo
 * TODA la tienda, imágenes incluidas. Por eso el reproductor usa
 * preload="none" (ver docs/03-STORAGE.md).
 */
export async function uploadProductVideo(formData: FormData): Promise<MediaResult> {
  await requireAdmin()

  const productId = String(formData.get('productId') ?? '')
  if (!z.string().uuid().safeParse(productId).success) {
    return { ok: false, error: 'Producto inválido.' }
  }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No llego ningun archivo.' }

  if (file.size > UPLOAD_LIMITS.video.maxBytes) {
    return { ok: false, error: 'El video supera los 25 MB.' }
  }

  if (!UPLOAD_LIMITS.video.accept.includes(file.type as 'video/mp4' | 'video/webm')) {
    return { ok: false, error: 'Solo aceptamos MP4 o WebM.' }
  }

  const admin = createAdminClient()

  const { count } = await admin
    .from('product_media')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('type', 'video')

  if ((count ?? 0) >= UPLOAD_LIMITS.video.maxPerProduct) {
    return { ok: false, error: 'Ya hay un video en esta pieza. Borra el actual primero.' }
  }

  const mediaId = crypto.randomUUID()
  const extensión = file.type === 'video/webm' ? 'webm' : 'mp4'
  const path = `products/${productId}/${mediaId}.${extensión}`

  const { error: uploadError } = await admin.storage
    .from('catalog')
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) return { ok: false, error: 'No pudimos guardar el video.' }

  // El poster: la portada actual del producto, para que el video no muestre
  // un rectangulo negro antes de reproducirse.
  const { data: cover } = await admin
    .from('product_media')
    .select('thumb_path')
    .eq('product_id', productId)
    .eq('type', 'image')
    .order('is_cover', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await admin.from('product_media').insert({
    id: mediaId,
    product_id: productId,
    type: 'video',
    storage_path: path,
    thumb_path: cover?.thumb_path ?? null,
    size_bytes: file.size,
    position: 99,
  })

  if (error) {
    await admin.storage.from('catalog').remove([path])
    return { ok: false, error: 'No pudimos registrar el video.' }
  }

  revalidatePath(`/admin/productos/${productId}`)
  return { ok: true, mediaId }
}

export async function deleteMedia(mediaId: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: media } = await admin
    .from('product_media')
    .select('*')
    .eq('id', mediaId)
    .maybeSingle()

  if (!media) return { ok: false, error: 'La imagen ya no existe.' }

  const paths = [media.storage_path, media.thumb_path].filter(Boolean) as string[]
  await admin.storage.from('catalog').remove(paths)
  await admin.from('product_media').delete().eq('id', mediaId)

  // Si se borro la portada, la siguiente imagen toma su lugar: un producto
  // sin portada se ve roto en el catálogo.
  if (media.is_cover) {
    const { data: next } = await admin
      .from('product_media')
      .select('id')
      .eq('product_id', media.product_id)
      .eq('type', 'image')
      .order('position')
      .limit(1)
      .maybeSingle()

    if (next) {
      await admin.from('product_media').update({ is_cover: true }).eq('id', next.id)
    }
  }

  revalidatePath(`/admin/productos/${media.product_id}`)
  return { ok: true }
}

export async function setCoverImage(
  mediaId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: media } = await admin
    .from('product_media')
    .select('product_id')
    .eq('id', mediaId)
    .maybeSingle()

  if (!media) return { ok: false, error: 'La imagen ya no existe.' }

  // El índice único parcial solo admite una portada por producto: primero se
  // baja la actual, después se sube la nueva.
  await admin
    .from('product_media')
    .update({ is_cover: false })
    .eq('product_id', media.product_id)
    .eq('is_cover', true)

  await admin.from('product_media').update({ is_cover: true }).eq('id', mediaId)

  revalidatePath(`/admin/productos/${media.product_id}`)
  return { ok: true }
}

export async function reorderMedia(
  productId: string,
  orderedIds: string[],
): Promise<{ ok: boolean }> {
  await requireAdmin()
  const admin = createAdminClient()

  await Promise.all(
    orderedIds.map((id, index) =>
      admin.from('product_media').update({ position: index }).eq('id', id),
    ),
  )

  revalidatePath(`/admin/productos/${productId}`)
  return { ok: true }
}

export async function updateMediaAlt(
  mediaId: string,
  alt: string,
): Promise<{ ok: boolean }> {
  await requireAdmin()
  const admin = createAdminClient()
  await admin
    .from('product_media')
    .update({ alt: alt.trim().slice(0, 200) || null })
    .eq('id', mediaId)
  return { ok: true }
}
