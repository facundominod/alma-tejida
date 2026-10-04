'use client'

import { createBrowserClient } from '@supabase/ssr'
import { env } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Cliente del NAVEGADOR.
 *
 * Usa la clave anonima, que es publica por diseño. Lo que este cliente puede
 * ver o tocar lo decide RLS en la base, no este archivo. Se usa únicamente
 * para sesión (login/logout) y para las pocas lecturas que tienen que ocurrir
 * después de la hidratación; todo lo demas se resuelve en el servidor.
 */
let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createClient() {
  browserClient ??= createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
  return browserClient
}
