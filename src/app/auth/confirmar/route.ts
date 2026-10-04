import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Confirmación de correo y magic link.
 *
 * Supabase redirige acá con un `token_hash`. Se canjea por una sesión y se
 * vinculan los pedidos que la persona haya hecho como invitada con ese mismo
 * correo (link_guest_orders solo lo hace si el correo está verificado).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/cuenta'

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/ingresar?error=enlace-invalido`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    type: type as 'email' | 'recovery' | 'magiclink' | 'signup',
    token_hash: tokenHash,
  })

  if (error) {
    return NextResponse.redirect(`${origin}/ingresar?error=enlace-vencido`)
  }

  await supabase.rpc('link_guest_orders')

  const target = type === 'recovery' ? '/auth/nueva-contrasena' : next
  return NextResponse.redirect(`${origin}${target}`)
}
