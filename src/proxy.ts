import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refresca la sesión en cada navegación y protege las zonas privadas.
 *
 * Esto NO reemplaza a RLS: es la capa de comodidad que evita que alguien vea
 * una pantalla de administración parpadeando antes de que la base le diga que
 * no. La autorización de verdad ocurre en la base, siempre.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // getUser() válida el token contra Supabase. getSession() solo lee la
  // cookie, que el navegador podría haber manipulado: por eso no se usa.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isAdminArea = path.startsWith('/admin')
  const isAccountArea = path.startsWith('/cuenta')

  if ((isAdminArea || isAccountArea) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/ingresar'
    url.searchParams.set('volver', path)

    // La redirección es una respuesta nueva: si no se le pone la cabecera
    // acá, se pierde y un buscador podría indexar la URL privada.
    const redirect = NextResponse.redirect(url)
    redirect.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return redirect
  }

  if (isAdminArea && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // Zonas privadas fuera de los buscadores (punto 206)
  if (isAdminArea || isAccountArea) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Todo menos assets estáticos e imágenes: no tiene sentido gastar una
     * validación de sesión en cargar un favicon.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm)$).*)',
  ],
}
