'use client'

import * as React from 'react'

/**
 * Estado de sesión en el cliente.
 *
 * Existe para que el layout público NO tenga que leer cookies. Cualquier
 * lectura de cookies en el servidor obliga a Next a renderizar la ruta de
 * forma dinámica, y la home, el catálogo y las fichas de producto tienen que
 * poder servirse cacheadas desde el CDN (ver src/lib/supabase/public.ts).
 *
 * Lo único que depende de la sesión en la tienda pública es si el icono de
 * cuenta dice "Ingresar" o "Mi cuenta".
 *
 * Por eso el cliente de Supabase se carga con un `import()` dinámico, dentro del
 * efecto. Pesa unos 66 KB comprimidos, y tenerlo en el bundle inicial
 * significaba descargarlo en TODAS las páginas —incluso en las que nadie va a
 * iniciar sesión— antes de poder pintar nada. Cargándolo después, la tienda se
 * dibuja primero y el enlace de cuenta se ajusta solo un instante más tarde.
 * Para quien mira, el resultado es el mismo; para quien tiene mala señal, no.
 *
 * Todo lo que de verdad importa —quién puede ver o modificar qué— lo decide
 * RLS en la base. Este estado es interfaz, no seguridad.
 */

type AuthState = {
  userId: string | null
  email: string | null
  isLoggedIn: boolean
  /** false hasta la primera comprobación */
  ready: boolean
}

const INICIAL: AuthState = {
  userId: null,
  email: null,
  isLoggedIn: false,
  ready: false,
}

const AuthContext = React.createContext<AuthState>(INICIAL)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>(INICIAL)

  React.useEffect(() => {
    let activo = true
    let desuscribir: (() => void) | undefined

    void (async () => {
      // El import dinámico saca a Supabase del bundle inicial: se descarga en
      // su propio archivo, después de que la página ya se pintó.
      const { createClient } = await import('@/lib/supabase/client')
      if (!activo) return

      const supabase = createClient()

      const aplicar = (user: { id: string; email?: string } | null) => {
        if (!activo) return
        setState({
          userId: user?.id ?? null,
          email: user?.email ?? null,
          isLoggedIn: Boolean(user),
          ready: true,
        })
      }

      const { data } = await supabase.auth.getUser()
      aplicar(data.user ?? null)

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_evento, sesion) => {
        aplicar(sesion?.user ?? null)
      })

      desuscribir = () => subscription.unsubscribe()
    })()

    return () => {
      activo = false
      desuscribir?.()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return React.useContext(AuthContext)
}
