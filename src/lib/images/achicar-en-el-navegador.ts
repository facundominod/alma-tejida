'use client'

import { IMAGE_DERIVATIVES } from '@/lib/images'

/**
 * Achica la foto ANTES de mandarla.
 *
 * El problema que resuelve: una foto de celular pesa unos 4 MB, y hasta ahora
 * viajaba entera desde el teléfono hasta la función que la procesa —que en el
 * plan gratuito de Netlify vive en Ohio, no se puede mover de región—. A la
 * velocidad de subida de un celular argentino eso son unos quince segundos
 * POR FOTO, y el servidor lo primero que hace con esos 4 MB es tirar el 95 %
 * al reducirla a 1600px.
 *
 * Reducirla acá convierte esos 4 MB en unos 250 KB: dieciséis veces menos
 * para subir. El trabajo lo hace el teléfono, que lo hace en menos de un
 * segundo, en vez de la red, que tarda quince.
 *
 * El servidor SIGUE procesando y validando todo igual. Esto no le quita
 * trabajo: le quita espera. Lo que llega sigue pasando por sharp, por la
 * comprobación de que el archivo es de verdad una imagen y por los límites de
 * tamaño, porque nada que venga del navegador se da por bueno.
 *
 * Si algo falla —un formato que el navegador no sabe decodificar, un HEIC en
 * un Android, un canvas bloqueado— devuelve el archivo ORIGINAL y la subida
 * sigue como antes. Nunca impide subir una foto.
 */

/** Un poco más grande que el derivado final, para no recortar dos veces. */
const LADO_MAXIMO = IMAGE_DERIVATIVES.main.maxSide * 1.15 // ~1840px

/** Debajo de esto no vale la pena: el recodificado puede incluso agrandarla. */
const MINIMO_PARA_ACHICAR = 400 * 1024

export async function achicarEnElNavegador(archivo: File): Promise<File> {
  if (archivo.size < MINIMO_PARA_ACHICAR) return archivo
  // Se intenta con CUALQUIER imagen, no solo con los formatos de la lista.
  //
  // Antes se saltaba todo lo que no estuviera en `accept`, y eso dejaba pasar
  // justo el caso peor: un HEIC de iPhone, que pesa lo mismo que un JPEG y no
  // se achicaba. Si el navegador no sabe decodificarlo, `createImageBitmap`
  // lanza y el `catch` devuelve el original, que es lo mismo que hacia antes.
  // Intentar no cuesta nada; no intentar cuesta 4 MB.
  //
  // Lo que salga de aca es WebP, que si esta en la lista del servidor.
  if (!archivo.type.startsWith('image/')) return archivo
  if (typeof createImageBitmap !== 'function') return archivo

  let bitmap: ImageBitmap | undefined

  try {
    // `from-image` respeta la orientación EXIF. Sin esto, las fotos sacadas
    // de costado llegan acostadas: el canvas no lee EXIF por su cuenta.
    bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' })

    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
    if (escala === 1 && archivo.type === 'image/webp') return archivo

    const ancho = Math.round(bitmap.width * escala)
    const alto = Math.round(bitmap.height * escala)

    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto

    const contexto = lienzo.getContext('2d')
    if (!contexto) return archivo

    contexto.imageSmoothingQuality = 'high'
    contexto.drawImage(bitmap, 0, 0, ancho, alto)

    const blob = await new Promise<Blob | null>((resolve) =>
      lienzo.toBlob(resolve, 'image/webp', 0.9),
    )

    // Si el resultado no es más chico, no se gana nada y se pierde calidad.
    if (!blob || blob.size >= archivo.size) return archivo

    return new File([blob], cambiarExtension(archivo.name), {
      type: 'image/webp',
      lastModified: Date.now(),
    })
  } catch {
    return archivo
  } finally {
    bitmap?.close()
  }
}

function cambiarExtension(nombre: string) {
  return nombre.replace(/\.[^.]+$/, '') + '.webp'
}
