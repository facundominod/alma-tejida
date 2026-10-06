'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { Menu, Search, ShoppingBag, User, X } from 'lucide-react'
import { BrandMark } from '@/components/tienda/brand-mark'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth/auth-state'
import { useCart } from '@/lib/cart/cart-store'
import { usePresence } from '@/lib/ui/use-presence'
import { cn } from '@/lib/utils'
import type { Category } from '@/types/database'

type NavLink = { href: string; label: string }

const BASE_LINKS: NavLink[] = [
  { href: '/tienda', label: 'Tienda' },
  { href: '/ofertas', label: 'Ofertas' },
  { href: '/contacto', label: 'Contacto' },
]

export function SiteHeader({
  categories,
  logoUrl,
  storeName,
}: {
  categories: Category[]
  logoUrl: string | null
  storeName: string
}) {
  const pathname = usePathname()
  const cart = useCart()
  const { isLoggedIn } = useAuth()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [hidden, setHidden] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)
  const lastY = React.useRef(0)

  // El header se esconde al bajar y vuelve al subir: en un celular, 56px de
  // alto son 56px menos de fotografía.
  //
  // Un listener de scroll pasivo en lugar de useScroll de Motion: hace lo
  // mismo y no obliga a cargar la librería en todas las páginas.
  React.useEffect(() => {
    let pendiente = false

    function onScroll() {
      if (pendiente) return
      pendiente = true

      // Las lecturas se agrupan en el frame: leer scrollY en cada evento
      // obliga al navegador a recalcular el layout una y otra vez.
      requestAnimationFrame(() => {
        const y = window.scrollY
        setScrolled(y > 8)

        // Con el menú abierto el header no se mueve: taparía el panel.
        if (!menuOpen) {
          setHidden(y > lastY.current && y > 140)
        }

        lastY.current = y
        pendiente = false
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
    // Se vuelve a suscribir al abrir o cerrar el menú. Pasa dos veces por
    // visita, así que es más barato que mantener una referencia mutable.
  }, [menuOpen])

  // Cambiar de página cierra el menú.
  // Se ajusta durante el render comparando con el valor anterior, que es el
  // patron que React recomienda para "reaccionar a un cambio de props". Un
  // efecto con setState acá provocaría un render en cascada en cada
  // navegación.
  const [lastPath, setLastPath] = React.useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setMenuOpen(false)
  }

  // Con el menú abierto, el fondo no scrollea
  React.useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b',
        // Sólo transform y color: el navegador lo resuelve en el compositor
        'transition-[transform,background-color,border-color]',
        'duration-[var(--at-dur-base)] ease-[var(--ease-out-alma)]',
        'motion-reduce:transition-none',
        hidden ? '-translate-y-full' : 'translate-y-0',
        scrolled
          ? 'border-border-soft bg-background/85 backdrop-blur-md'
          : 'border-transparent bg-background',
      )}
    >
      <div className="at-container flex h-14 items-center justify-between gap-3 md:h-18">
        {/* Menú en móvil */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="-ml-2 grid size-11 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted md:hidden"
          aria-label="Abrir menú"
          aria-expanded={menuOpen}
        >
          <Menu className="size-5" />
        </button>

        <Link href="/" className="shrink-0" aria-label={`${storeName} — Inicio`}>
          <BrandMark logoUrl={logoUrl} storeName={storeName} size="md" />
        </Link>

        {/* Navegación en desktop */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
          {BASE_LINKS.map((link) => {
            const active = pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-lg px-3.5 py-2 text-[0.9375rem] transition-colors',
                  active
                    ? 'font-medium text-clay-700'
                    : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-0.5">
          <Link
            href="/tienda?buscar="
            className="grid size-11 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            aria-label="Buscar"
          >
            <Search className="size-5" />
          </Link>

          <Link
            href={isLoggedIn ? '/cuenta' : '/ingresar'}
            className="hidden size-11 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink md:grid"
            aria-label={isLoggedIn ? 'Mi cuenta' : 'Ingresar'}
          >
            <User className="size-5" />
          </Link>

          <button
            type="button"
            onClick={cart.open}
            className="relative -mr-2 grid size-11 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            aria-label={`Carrito${cart.count ? `, ${cart.count} productos` : ' vacío'}`}
          >
            <ShoppingBag className="size-5" />
            {cart.ready && cart.count > 0 && (
              // La `key` fuerza un elemento nuevo en cada cambio, y con el
              // elemento nuevo vuelve a correr la animación de entrada.
              <span
                key={cart.count}
                className="at-pop tabular absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.6875rem] font-semibold leading-5 text-on-primary"
              >
                {cart.count}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Panel de navegación en móvil */}
      <MobileMenu
        abierto={menuOpen}
        categories={categories}
        isLoggedIn={isLoggedIn}
        onClose={() => setMenuOpen(false)}
      />
    </header>
  )
}

function MobileMenu({
  abierto,
  categories,
  isLoggedIn,
  onClose,
}: {
  abierto: boolean
  categories: Category[]
  isLoggedIn: boolean
  onClose: () => void
}) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const { montado, visible } = usePresence(abierto, 280)

  // Escape cierra; el foco entra al panel
  React.useEffect(() => {
    if (!montado) return

    panelRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [montado, onClose])

  if (!montado) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 transition-opacity duration-[var(--at-dur-fast)] md:hidden',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <button
        type="button"
        className="absolute inset-0 bg-linen-900/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar menú"
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 left-0 flex w-[84%] max-w-xs flex-col bg-background',
          'shadow-overlay focus:outline-none',
          'transition-transform duration-[280ms] ease-[var(--ease-out-alma)]',
          'motion-reduce:transition-none',
          visible ? 'translate-x-0' : '-translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
      >
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <BrandMark size="sm" />
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-lg text-ink-muted"
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4" aria-label="Principal">
          {BASE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-lg px-4 py-3 text-lg text-ink transition-colors hover:bg-surface-muted"
            >
              {link.label}
            </Link>
          ))}

          {categories.length > 0 && (
            <>
              <p className="mt-6 px-4 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                Categorías
              </p>
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/categoria/${category.slug}`}
                  className="block rounded-lg px-4 py-2.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                >
                  {category.name}
                </Link>
              ))}
            </>
          )}
        </nav>

        <div className="border-t border-border-soft p-4">
          <Button asChild variant="secondary" block>
            <Link href={isLoggedIn ? '/cuenta' : '/ingresar'}>
              <User />
              {isLoggedIn ? 'Mi cuenta' : 'Ingresar'}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
