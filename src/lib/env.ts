/**
 * Variables de entorno públicas.
 *
 * Sin Zod, a propósito.
 *
 * Este módulo lo importan el cliente del navegador y `images.ts`, que a su vez
 * usan casi todos los componentes. Validar cuatro cadenas con un esquema
 * arrastraba Zod entero al bundle del navegador —unos 13 KB comprimidos en
 * CADA página— para comprobar que una URL empieza con http. Zod se sigue
 * usando donde corresponde: en las Server Actions, que nunca viajan al
 * navegador.
 *
 * Si falta algo, el error aparece al arrancar y con un mensaje accionable, no
 * en medio de una compra con un `undefined` inexplicable.
 */

function requerida(nombre: string, valor: string | undefined): string {
  const limpio = valor?.trim()
  if (!limpio) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. ` +
        'Copiá .env.example a .env.local y completala (ver docs/09-PUESTA-EN-MARCHA.md).',
    )
  }
  return limpio
}

function comoUrl(nombre: string, valor: string | undefined): string {
  const limpio = requerida(nombre, valor)
  try {
    new URL(limpio)
  } catch {
    throw new Error(`${nombre} tiene que ser una URL válida. Llegó: "${limpio}"`)
  }
  return limpio
}

/**
 * Next reemplaza `process.env.NEXT_PUBLIC_*` en tiempo de build sustituyendo
 * literalmente cada referencia, así que hay que nombrarlas una por una: un
 * acceso dinámico como process.env[clave] no se sustituye y llega vacío.
 */
export const env = {
  NEXT_PUBLIC_SUPABASE_URL: comoUrl(
    'NEXT_PUBLIC_SUPABASE_URL',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requerida(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  NEXT_PUBLIC_SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim(),
} as const

export const siteUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
