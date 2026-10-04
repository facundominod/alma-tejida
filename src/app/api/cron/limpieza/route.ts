import { NextResponse } from 'next/server'
import { assertCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Limpieza diaria.
 *
 * Borra eventos de analítica de más de 90 días, ventanas de rate limit
 * vencidas y carritos anonimos abandonados. Es lo que mantiene la base
 * dentro de los 500 MB del plan gratuito sin tener que pensar en ello.
 */
export async function GET(request: Request) {
  const denied = assertCron(request)
  if (denied) return denied

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('purge_old_data')

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...(data as object) })
}
