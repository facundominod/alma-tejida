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
  /**
   * Sólo decide si se MUESTRA el enlace al panel. No autoriza nada.
   *
   * Quien quiera, puede poner esto en true desde la consola del navegador y
   * lo único que va a conseguir es ver un enlace que, al tocarlo, lo devuelve
   * a /ingresar. Lo que protege el panel es el proxy del servidor y, debajo,
   * RLS: ninguna de las dos cosas le pregunta al navegador quién es
   * (punto 10).
   */
  isAdmin: boolean
  /** false hasta la primera comprobación */
  ready: boolean
}

const INICIAL: AuthState = {
  userId: null,
  email: null,
  isLoggedIn: false,
  isAdmin: false,
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

      const aplicar = async (user: { id: string; email?: string } | null) => {
        if (!activo) return

        // Se pinta enseguida con lo que ya se sabe; el rol llega después.
        setState({
          userId: user?.id ?? null,
          email: user?.email ?? null,
          isLoggedIn: Boolean(user),
          isAdmin: false,
          ready: true,
        })

        if (!user) return

        // Una consulta más, y sólo para quien inició sesión: quien entra a
        // mirar la tienda —la enorme mayoría— no paga nada por esto.
        //
        // El rol no viaja en el token: vive en `profiles`, y RLS deja que cada
        // persona lea únicamente su propia fila. Por eso preguntarlo acá no
        // expone nada de nadie.
        const { data: perfil } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()

        if (!activo) return
        setState((previo) =>
          previo.userId === user.id
            ? { ...previo, isAdmin: perfil?.role === 'admin' }
            : previo,
        )
      }

      const { data } = await supabase.auth.getUser()
      void aplicar(data.user ?? null)

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_evento, sesion) => {
        void aplicar(sesion?.user ?? null)
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
