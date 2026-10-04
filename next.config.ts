import type { NextConfig } from 'next'

// La URL publica del sitio decide si se fuerza HTTPS en la CSP (ver abajo).
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined

/**
 * Content Security Policy.
 * Solo se habilitan los origenes que la aplicacion usa de verdad.
 * 'unsafe-inline' en style-src es inevitable con Tailwind + next/font.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
  "media-src 'self' blob: https://*.supabase.co https://*.supabase.in",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  /**
   * `upgrade-insecure-requests` sólo cuando el sitio SE SIRVE por HTTPS.
   *
   * Se decide por la URL real del sitio y no por NODE_ENV, porque el build de
   * producción también se corre en local (las pruebas de navegador lo usan) y
   * ahí se sirve por HTTP.
   *
   * Por qué importa: Chromium exime a localhost de esta directiva, pero
   * WebKit NO. En Safari y en el iPhone, servido por HTTP, el navegador pide
   * `https://localhost:3000/...`, falla con error de SSL y la página se queda
   * SIN JAVASCRIPT: el carrito nunca arranca y el menú no abre.
   *
   * Lo encontró la prueba de Playwright en iPhone. En Chrome no se veía.
   */
  ...(siteUrl.startsWith('https://') ? ['upgrade-insecure-requests'] : []),
].join('; ')

const nextConfig: NextConfig = {
  reactStrictMode: true,

  images: {
    // Formatos modernos primero. next/image negocia con el navegador.
    formats: ['image/avif', 'image/webp'],
    // Anchos reales de los contextos de la tienda: tarjeta en movil (2 col),
    // tarjeta en desktop (4 col), galeria y hero.
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1600],
    imageSizes: [64, 96, 128, 192, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
      {
        // Las zonas privadas nunca se indexan (punto 206)
        source: '/(admin|cuenta)/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },
}

export default nextConfig
