import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Cliente del SERVIDOR con la identidad real del visitante.
 *
 * Es el cliente por defecto de toda la aplicación: usa la clave anonima más
 * la cookie de sesión, así que RLS se aplica exactamente igual que en el
 * navegador, pero sin exponer nada. Si una consulta funciona con este cliente,
 * es porque las policies la permiten de verdad.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Los Server Components no pueden escribir cookies. El refresco de
            // sesión lo hace el middleware, así que acá se ignora sin problema.
          }
        },
      },
    },
  )
}

/** Usuario actual, o null. Nunca lanza. */
export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * Perfil actual (incluye el rol). El rol se lee SIEMPRE de la base, nunca de
 * un claim del JWT que el cliente pudiera haber manipulado.
 */
export async function getCurrentProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, role, full_name, email, phone, accepts_marketing')
    .eq('id', user.id)
    .single()

  return data ?? null
}

export async function isAdmin() {
  const profile = await getCurrentProfile()
  return profile?.role === 'admin'
}

/**
 * Puerta de entrada de TODA acción administrativa.
 *
 * Verifica contra la base, no contra un estado de React ni un claim. Lanza si
 * no corresponde: ninguna Server Action administrativa toca nada antes de que
 * esta función haya devuelto.
 */
export async function requireAdmin() {
  const profile = await getCurrentProfile()

  if (!profile || profile.role !== 'admin') {
    throw new Error('FORBIDDEN')
  }

  return profile
}
