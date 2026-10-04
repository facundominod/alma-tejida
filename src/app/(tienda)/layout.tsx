import { BottomNav } from '@/components/tienda/bottom-nav'
import { CartSheet } from '@/components/tienda/cart-sheet'
import { SiteFooter } from '@/components/tienda/site-footer'
import { SiteHeader } from '@/components/tienda/site-header'
import { AuthProvider } from '@/lib/auth/auth-state'
import { CartProvider } from '@/lib/cart/cart-store'
import { getStoreSettings, getTopCategories } from '@/lib/queries/store'

/**
 * Layout de la tienda publica.
 *
 * No lee cookies a proposito: eso permite que la home, el catálogo y las
 * fichas se generen estaticamente y se sirvan desde el CDN. La sesión se
 * resuelve en el cliente (AuthProvider), porque lo único que cambia con ella
 * es la etiqueta del enlace de cuenta.
 */
export default async function TiendaLayout({ children }: LayoutProps<'/'>) {
  // React cachea cada consulta dentro del render: header y footer las
  // comparten sin volver a consultar.
  const [settings, categories] = await Promise.all([
    getStoreSettings(),
    getTopCategories(),
  ])

  return (
    <AuthProvider>
      <CartProvider>
        <SiteHeader
          categories={categories}
          logoUrl={settings.logo_url}
          storeName={settings.store_name}
        />

        {/* pb-14 deja lugar a la barra inferior de móvil */}
        <main id="contenido" className="flex-1 pb-14 md:pb-0">
          {children}
        </main>

        <SiteFooter settings={settings} categories={categories} />

        <BottomNav />
        <CartSheet />
      </CartProvider>
    </AuthProvider>
  )
}
