import { NextResponse } from 'next/server'
import { assertCron } from '@/lib/cron-auth'
import { createPublicClient } from '@/lib/supabase/public'

export const dynamic = 'force-dynamic'

/**
 * Ping diario.
 *
 * Un proyecto de Supabase en plan gratuito se PAUSA tras varios días sin
 * actividad, y despertarlo tarda. Una consulta trivial por día evita que la
 * tienda aparezca caida un lunes a la mañana.
 */
export async function GET(request: Request) {
  const denied = assertCron(request)
  if (denied) return denied

  const supabase = createPublicClient()
  const { error } = await supabase.from('store_settings').select('id').limit(1)

  return NextResponse.json({ ok: !error, at: new Date().toISOString() })
}
