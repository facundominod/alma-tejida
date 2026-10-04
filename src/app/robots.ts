import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Zonas privadas y rutas sin valor para un buscador (punto 206)
        disallow: ['/admin', '/cuenta', '/checkout', '/carrito', '/pedido', '/api'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
