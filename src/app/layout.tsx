import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import { siteUrl } from '@/lib/env'
import './globals.css'

/**
 * Dos familias variables, subset latino, auto-hospedadas por next/font.
 * Cero peticiones a dominios externos y cero layout shift.
 */
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  display: 'swap',
  // Sin `weight`: se carga como fuente variable, que es lo que permite pedir
  // el eje SOFT (redondea las terminaciones) y opsz (ajuste optico por
  // tamaño). Declarar pesos fijos y ejes a la vez no es posible.
  axes: ['SOFT', 'opsz'],
})

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Alma Tejida · Piezas tejidas a mano',
    template: '%s · Alma Tejida',
  },
  description:
    'Mantas, almohadones y piezas de decoración tejidas a mano, una por una. ' +
    'Creaciones que unen arte y esencia.',
  applicationName: 'Alma Tejida',
  authors: [{ name: 'Alma Tejida' }],
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    siteName: 'Alma Tejida',
    title: 'Alma Tejida · Piezas tejidas a mano',
    description:
      'Mantas, almohadones y piezas de decoración tejidas a mano, una por una.',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#fbf8f4',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  // Nunca se bloquea el zoom: hacerlo es un problema de accesibilidad real.
  maximumScale: 5,
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="es-AR"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-ink">
        {/* Primer elemento tabulable de la página (accesibilidad) */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-card"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  )
}
