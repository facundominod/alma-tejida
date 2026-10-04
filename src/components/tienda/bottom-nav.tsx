'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { Home, ShoppingBag, Store, User } from 'lucide-react'
import { useAuth } from '@/lib/auth/auth-state'
import { useCart } from '@/lib/cart/cart-store'
import { cn } from '@/lib/utils'

/**
 * Navegación inferior, solo en móvil (punto 126).
 *
 * Cuatro destinos, 44px de área táctil, badge en el carrito, y se esconde
 * cuando hay un teclado abierto para no taparlo.
 */
export function BottomNav() {
  const pathname = usePathname()
  const cart = useCart()
  const { isLoggedIn } = useAuth()
  const [keyboardOpen, setKeyboardOpen] = React.useState(false)

  // Al enfocar un campo de texto en un celular, el teclado ocupa media
  // pantalla. Una barra fija encima sería justamente lo que sobra.
  React.useEffect(() => {
    function onFocusIn(event: FocusEvent) {
      const target = event.target as HTMLElement | null
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        setKeyboardOpen(true)
      }
    }
    function onFocusOut() {
      setKeyboardOpen(false)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  const items = [
    { href: '/', label: 'Inicio', icon: Home, exact: true },
    { href: '/tienda', label: 'Tienda', icon: Store },
    { href: '/carrito', label: 'Carrito', icon: ShoppingBag, badge: cart.count },
    { href: isLoggedIn ? '/cuenta' : '/ingresar', label: 'Cuenta', icon: User },
  ]

  if (keyboardOpen) return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-soft bg-background/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegación principal"
    >
      <ul className="flex">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] transition-colors',
                  active ? 'text-clay-700' : 'text-ink-subtle',
                )}
              >
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={active ? 2.1 : 1.7} />
                  {cart.ready && item.badge ? (
                    <span className="tabular absolute -right-2.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-4 text-on-primary">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
