'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/server'
import { UPLOAD_LIMITS } from '@/lib/images'

/**
 * Subida directa del navegador al almacenamiento.
 *
 * EL PROBLEMA QUE RESUELVE
 * Hasta acá todo archivo viajaba dentro de una Server Action: del teléfono a
 * la función de Netlify —que vive en Ohio— y recién de ahí a Supabase, que
 * está en São Paulo. Dos problemas, uno de ellos insalvable:
 *
 *   1. Las funciones cortan la petición alrededor de los 6 MB. Un video de
 *      25 MB NO LLEGA NUNCA, por más que la aplicación diga que los acepta.
 *   2. El archivo cruza el continente dos veces antes de llegar a destino.
 *
 * CÓMO FUNCIONA AHORA
 * El servidor no toca el archivo: sólo firma un permiso de subida para una
 * ruta concreta, que vale unos minutos. El navegador sube directo a Supabase
 * —un solo viaje, sin tope de 6 MB, y con barra de progreso de verdad— y
 * después avisa al servidor para que registre el archivo.
 *
 * QUÉ SE SIGUE VALIDANDO EN EL SERVIDOR
 * Todo lo que importa, en los dos extremos:
 *
 *   - que quien pide sea administradora, en los dos pasos;
 *   - que el tipo y el tamaño declarados estén permitidos, ANTES de firmar;
 *   - que el producto exista y no haya llegado a su cuota;
 *   - y al registrar, que el archivo ESTÉ de verdad en el almacenamiento y
 *     pese lo que dijo pesar. Lo que el navegador afirma no se da por bueno:
 *     se comprueba contra el archivo subido.
 *
 * La ruta la arma el servidor, nunca el navegador: si la eligiera el cliente,
 * podría pedir permiso para escribir encima de la foto de otra pieza.
 */

type Permiso =
  | { ok: true; ruta: string; token: string }
  | { ok: false; error: string }

const pedido = z.object({
  productId: z.string().uuid(),
  tipoMime: z.string().min(3).max(100),
  tamanioBytes: z.number().int().positive(),
})

/** Paso 1: el servidor firma el permiso. No ve el archivo. */
export async function pedirPermisoDeSubida(entrada: unknown): Promise<Permiso> {
  await requireAdmin()

  const parsed = pedido.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: 'Datos de subida inválidos.' }

  const { productId, tipoMime, tamanioBytes } = parsed.data

  const esVideo = UPLOAD_LIMITS.video.accept.includes(tipoMime as 'video/mp4' | 'video/webm')
  if (!esVideo) {
    return { ok: false, error: 'Solo aceptamos video MP4 o WebM.' }
  }

  if (tamanioBytes > UPLOAD_LIMITS.video.maxBytes) {
    return {
      ok: false,
      error: `El video supera los ${Math.round(UPLOAD_LIMITS.video.maxBytes / 1024 / 1024)} MB.`,
    }
  }

  const admin = createAdminClient()

  const { data: producto } = await admin
    .from('products')
    .select('id')
    .eq('id', productId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!producto) return { ok: false, error: 'Esa pieza no existe.' }

  // La cuota se cuenta contra la base, no contra lo que diga el formulario.
  const { count } = await admin
    .from('product_media')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('type', 'video')

  if ((count ?? 0) >= UPLOAD_LIMITS.video.maxPerProduct) {
    return { ok: false, error: 'Ya hay un video en esta pieza. Borrá el actual primero.' }
  }

  const extension = tipoMime === 'video/webm' ? 'webm' : 'mp4'
  const ruta = `products/${productId}/${crypto.randomUUID()}.${extension}`

  const { data, error } = await admin.storage.from('catalog').createSignedUploadUrl(ruta)

  if (error || !data) return { ok: false, error: 'No pudimos preparar la subida.' }

  return { ok: true, ruta, token: data.token }
}

const registro = z.object({
  productId: z.string().uuid(),
  ruta: z.string().min(1).max(400),
})

/** Paso 2: el archivo ya está arriba; recién ahora se registra. */
export async function registrarVideoSubido(
  entrada: unknown,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()

  const parsed = registro.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: 'Datos inválidos.' }

  const { productId, ruta } = parsed.data

  // La ruta la armó el servidor con este formato. Si lo que llega no empieza
  // con la carpeta de ESTA pieza, alguien está intentando registrar un
  // archivo que no le corresponde.
  if (!ruta.startsWith(`products/${productId}/`)) {
    return { ok: false, error: 'Ruta inválida.' }
  }

  const admin = createAdminClient()

  // Que el archivo exista DE VERDAD y pese lo permitido. Sin esto, se podría
  // registrar una fila apuntando a un archivo que nunca se subió, y la pieza
  // quedaria con un video roto.
  const carpeta = ruta.slice(0, ruta.lastIndexOf('/'))
  const nombre = ruta.slice(ruta.lastIndexOf('/') + 1)

  const { data: archivos } = await admin.storage.from('catalog').list(carpeta, {
    search: nombre,
  })

  const archivo = archivos?.find((a) => a.name === nombre)
  if (!archivo) return { ok: false, error: 'El archivo no llegó. Probá de nuevo.' }

  const tamanio = Number(archivo.metadata?.size ?? 0)
  if (tamanio > UPLOAD_LIMITS.video.maxBytes) {
    await admin.storage.from('catalog').remove([ruta])
    return { ok: false, error: 'El video supera el tamaño permitido.' }
  }

  // El poster: la portada de la pieza, para que el video no muestre un
  // cuadro negro antes de que alguien le dé play.
  const { data: portada } = await admin
    .from('product_media')
    .select('thumb_path, storage_path')
    .eq('product_id', productId)
    .eq('type', 'image')
    .order('is_cover', { ascending: false })
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { error } = await admin.from('product_media').insert({
    product_id: productId,
    type: 'video',
    storage_path: ruta,
    thumb_path: portada?.thumb_path ?? portada?.storage_path ?? null,
    size_bytes: tamanio,
    position: 99,
  })

  if (error) {
    // Si no se puede registrar, el archivo no se deja tirado en el
    // almacenamiento ocupando la cuota del plan gratuito.
    await admin.storage.from('catalog').remove([ruta])
    return { ok: false, error: 'No pudimos registrar el video.' }
  }

  revalidatePath(`/admin/productos/${productId}`)
  return { ok: true }
}
