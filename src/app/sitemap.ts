import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'
import { getPublishedSlugs } from '@/lib/queries/catalog'
import { getCategories } from '@/lib/queries/store'

/**
 * Sitemap (punto 119).
 *
 * Solo catálogo publico. /admin y /cuenta NO aparecen acá y ademas emiten
 * X-Robots-Tag: noindex (punto 206).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([getPublishedSlugs(), getCategories()])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/tienda`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${siteUrl}/ofertas`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${siteUrl}/novedades`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${siteUrl}/contacto`, changeFrequency: 'monthly', priority: 0.5 },
  ]

  return [
    ...staticRoutes,
    ...categories.map((category) => ({
      url: `${siteUrl}/categoria/${category.slug}`,
      lastModified: new Date(category.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...products.map((product) => ({
      url: `${siteUrl}/producto/${product.slug}`,
      lastModified: new Date(product.updated),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
  ]
}
