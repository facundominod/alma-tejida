'use client'

import * as React from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Estado de sesión en el cliente.
 *
 * Existe para que el layout publico NO tenga que leer cookies. Cualquier
 * lectura de cookies en el servidor obliga a Next a renderizar la ruta de
 * forma dinámica, y la home, el catálogo y las fichas de producto tienen que
 * poder servirse cacheadas desde el CDN (ver src/lib/supabase/public.ts).
 *
 * Lo único que depende de la sesión en la tienda publica es si el icono de
 * cuenta dice "Ingresar" o "Mi cuenta". Resolverlo en el cliente cuesta un
 * parpadeo mínimo en ese enlace; resolverlo en el servidor costaría una
 * consulta a Supabase por cada visita a cada página.
 *
 * Todo lo que de verdad importa —quien puede ver o modificar que— lo decide
 * RLS en la base. Este estado es UI, no seguridad.
 */

type AuthState = {
  userId: string | null
  email: string | null
  isLoggedIn: boolean
  /** false hasta la primera comprobación */
  ready: boolean
}

const AuthContext = React.createContext<AuthState>({
  userId: null,
  email: null,
  isLoggedIn: false,
  ready: false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({
    userId: null,
    email: null,
    isLoggedIn: false,
    ready: false,
  })

  React.useEffect(() => {
    const supabase = createClient()
    let active = true

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      setState({
        userId: data.user?.id ?? null,
        email: data.user?.email ?? null,
        isLoggedIn: Boolean(data.user),
        ready: true,
      })
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sessión) => {
      if (!active) return
      setState({
        userId: sessión?.user.id ?? null,
        email: sessión?.user.email ?? null,
        isLoggedIn: Boolean(sessión?.user),
        ready: true,
      })
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return React.useContext(AuthContext)
}
