'use client'

import { env } from '@/lib/env'

/**
 * Sube un archivo directo al almacenamiento, con progreso.
 *
 * Usa `XMLHttpRequest` y no `fetch` por una sola razón: `fetch` no informa
 * cuánto lleva subido. En una foto de 200 KB da igual; en un video de 25 MB
 * por el 4G de un celular, una barra que avanza es la diferencia entre
 * esperar y pensar que se colgó —que es exactamente lo que estaba pasando—.
 *
 * El permiso lo firma el servidor y vale unos minutos. Acá no hay ninguna
 * credencial: el token sirve para escribir UNA ruta y nada más.
 */
export function subirDirecto({
  bucket,
  ruta,
  token,
  archivo,
  alProgresar,
  señal,
}: {
  bucket: string
  ruta: string
  token: string
  archivo: File
  alProgresar?: (porcentaje: number) => void
  señal?: AbortSignal
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${bucket}/${ruta}?token=${encodeURIComponent(token)}`

    const peticion = new XMLHttpRequest()
    peticion.open('PUT', url, true)
    peticion.setRequestHeader('content-type', archivo.type)
    // `x-upsert` en false: si la ruta ya existiera, mejor fallar que pisar
    // algo. El servidor arma una ruta nueva en cada subida, así que que
    // exista significaría que algo anda mal.
    peticion.setRequestHeader('x-upsert', 'false')

    peticion.upload.onprogress = (evento) => {
      if (!evento.lengthComputable || !alProgresar) return
      alProgresar(Math.round((evento.loaded / evento.total) * 100))
    }

    peticion.onload = () => {
      if (peticion.status >= 200 && peticion.status < 300) {
        resolve({ ok: true })
      } else {
        resolve({
          ok: false,
          error:
            peticion.status === 413
              ? 'El archivo es demasiado grande.'
              : 'No pudimos subir el archivo. Probá de nuevo.',
        })
      }
    }

    peticion.onerror = () =>
      resolve({ ok: false, error: 'Se cortó la conexión durante la subida.' })

    peticion.ontimeout = () =>
      resolve({ ok: false, error: 'La subida tardó demasiado. Probá con mejor señal.' })

    peticion.onabort = () => resolve({ ok: false, error: 'Subida cancelada.' })

    // Un video grande por una conexión lenta puede tardar varios minutos.
    peticion.timeout = 10 * 60 * 1000

    señal?.addEventListener('abort', () => peticion.abort(), { once: true })

    peticion.send(archivo)
  })
}
