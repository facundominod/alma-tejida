'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import {
  Bell,
  Boxes,
  FolderTree,
  LayoutDashboard,
  LogOut,
  MessageCircleQuestion,
  Package,
  Settings,
  ShoppingCart,
  Star,
  Store,
  Tag,
} from 'lucide-react'
import { BrandMark } from '@/components/tienda/brand-mark'
import { signOut } from '@/lib/actions/auth'
import { cn } from '@/lib/utils'

/**
 * Navegación del panel.
 *
 * Misma paleta y misma tipografia que la tienda, menos decoración: es una
 * herramienta de trabajo, no una vidriera (punto 178).
 *
 * En móvil, cuatro pestanas abajo con lo que el administrador usa todos los
 * días: pedidos, stock, productos y el resto. Cargar stock desde el celular
 * tiene que ser cómodo (punto 130).
 */

const SECTIONS = [
  { href: '/admin', label: 'Inicio', icon: LayoutDashboard, exact: true },
  { href: '/admin/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { href: '/admin/stock', label: 'Stock', icon: Boxes },
  { href: '/admin/productos', label: 'Productos', icon: Package },
  { href: '/admin/categorias', label: 'Categorías', icon: FolderTree },
  { href: '/admin/promociones', label: 'Promociones', icon: Tag },
  { href: '/admin/preguntas', label: 'Preguntas', icon: MessageCircleQuestion },
  { href: '/admin/resenas', label: 'Reseñas', icon: Star },
  { href: '/admin/configuracion', label: 'Configuración', icon: Settings },
]

/** Las cuatro que se usan a diario, para la barra inferior del celular. */
const MOBILE_TABS = SECTIONS.filter((s) =>
  ['/admin', '/admin/pedidos', '/admin/stock', '/admin/productos'].includes(s.href),
)

export function AdminNav({
  storeName,
  logoUrl,
  unreadCount,
  userName,
}: {
  storeName: string
  logoUrl: string | null
  unreadCount: number
  userName: string
}) {
  const pathname = usePathname()

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <>
      {/* Barra superior en móvil */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-soft bg-background px-4 md:hidden">
        <Link href="/admin" aria-label="Administración">
          <BrandMark logoUrl={logoUrl} storeName={storeName} size="sm" />
        </Link>
        <div className="flex items-center gap-1">
          <NotificationsLink count={unreadCount} />
          <Link
            href="/"
            className="grid size-11 place-items-center rounded-lg text-ink-muted"
            aria-label="Ver la tienda"
          >
            <Store className="size-5" />
          </Link>
        </div>
      </header>

      {/* Barra lateral en desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border-soft bg-background md:flex">
        <div className="flex h-18 items-center justify-between border-b border-border-soft px-5">
          <Link href="/admin" aria-label="Administración">
            <BrandMark logoUrl={logoUrl} storeName={storeName} size="sm" />
          </Link>
          <NotificationsLink count={unreadCount} />
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Administración">
          {SECTIONS.map((section) => {
            const active = isActive(section.href, section.exact)
            const Icon = section.icon

            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  active
                    ? 'bg-primary-soft font-medium text-clay-700'
                    : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                )}
              >
                <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.1 : 1.8} />
                {section.label}
              </Link>
            )
          })}
        </nav>

        <div className="space-y-1 border-t border-border-soft p-3">
          <p className="truncate px-3 pb-1 text-xs text-ink-subtle">{userName}</p>
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <Store className="size-[18px]" strokeWidth={1.8} />
            Ver la tienda
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-danger"
            >
              <LogOut className="size-[18px]" strokeWidth={1.8} />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Pestanas inferiores en móvil */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border-soft bg-background md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Secciones"
      >
        <ul className="flex">
          {MOBILE_TABS.map((tab) => {
            const active = isActive(tab.href, tab.exact)
            const Icon = tab.icon

            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem]',
                    active ? 'text-clay-700' : 'text-ink-subtle',
                  )}
                >
                  <Icon className="size-[22px]" strokeWidth={active ? 2.1 : 1.7} />
                  {tab.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}

function NotificationsLink({ count }: { count: number }) {
  return (
    <Link
      href="/admin/notificaciones"
      className="relative grid size-11 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      aria-label={count > 0 ? `Notificaciones, ${count} sin leer` : 'Notificaciones'}
    >
      <Bell className="size-5" />
      {count > 0 && (
        <span className="tabular absolute right-1.5 top-1.5 grid min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-[18px] text-on-primary">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}

/** Cabecera estandar de cada pantalla del panel. */
export function AdminHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl text-linen-900 md:text-3xl">{title}</h1>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
