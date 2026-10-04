import { z } from 'zod'

/**
 * Validación de variables de entorno.
 *
 * Si falta algo, el error aparece al arrancar con un mensaje claro, no en
 * medio de una compra con un `undefined` inexplicable.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'Falta NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
})

/**
 * Next reemplaza `process.env.NEXT_PUBLIC_*` en tiempo de build sustituyendo
 * literalmente cada referencia, así que hay que nombrarlas una por una: un
 * acceso dinámico como process.env[clave] no se sustituye y llega vacío.
 */
export const env = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
})

export const siteUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
