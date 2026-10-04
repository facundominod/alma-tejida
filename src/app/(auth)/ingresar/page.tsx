import { Suspense } from 'react'
import { SignInForm } from '@/components/auth/auth-forms'
import { ThreadLoader } from '@/components/ui/primitives'
import { CartProvider } from '@/lib/cart/cart-store'

export const metadata = { title: 'Ingresar', robots: { index: false } }

export default function IngresarPage() {
  return (
    // El formulario fusiona el carrito del visitante al iniciar sesión,
    // así que necesita el contexto del carrito.
    <CartProvider>
      <Suspense fallback={<ThreadLoader label="Cargando" />}>
        <SignInForm />
      </Suspense>
    </CartProvider>
  )
}
