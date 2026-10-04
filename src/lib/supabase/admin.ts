import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * ⚠️  CLIENTE CON SERVICE ROLE — SALTEA RLS POR COMPLETO.
 *
 * `import 'server-only'` en la primera línea es la defensa real: si un
 * componente marcado "use client" importa este modulo, aunque sea por error y
 * aunque sea indirectamente, **el build falla**. No es una convención que
 * alguien pueda olvidar respetar.
 *
 * Solo se usa para tres cosas:
 *   1. después de que requireAdmin() ya verifico el rol contra la base;
 *   2. tareas de sistema sin usuario (crons, agregación, miniaturas);
 *   3. el carrito del visitante sin cuenta, que RLS no puede identificar.
 *
 * Fuera de esos casos, se usa createClient() de server.ts, que respeta RLS.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!key) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY. Es obligatoria en el servidor y ' +
        'jamas debe definirse con el prefijo NEXT_PUBLIC_.',
    )
  }

  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}
