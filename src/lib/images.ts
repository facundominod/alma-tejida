import { env } from '@/lib/env'

/**
 * URLs de Storage y tamanos responsive.
 *
 * Regla que no se rompe: NUNCA se sirve la imagen de 1600px en una tarjeta de
 * 300px. Cada contexto declara su `sizes` real y next/image elige el archivo
 * correcto del srcset.
 */

const PUBLIC_BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`

export function storageUrl(
  path: string | null | undefined,
  bucket: 'catalog' | 'brand' = 'catalog',
): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${PUBLIC_BASE}/${bucket}/${path.replace(/^\/+/, '')}`
}

/** Imagen de portada de un producto, ya elegido el derivado correcto. */
export function coverUrl(product: {
  cover_thumb?: string | null
  cover_path?: string | null
}): string | null {
  return storageUrl(product.cover_thumb ?? product.cover_path)
}

/**
 * `sizes` por contexto. Declarados una vez, usados en todos lados: así no hay
 * dos tarjetas pidiendo anchos distintos para la misma caja.
 */
export const IMAGE_SIZES = {
  /** Catálogo: 2 columnas en móvil, 3 en tablet, 4 en desktop */
  card: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px',
  /** Destacados del home: carrusel horizontal en móvil */
  featured: '(max-width: 640px) 70vw, (max-width: 1024px) 33vw, 320px',
  /** Imagen grande de la ficha de producto */
  gallery: '(max-width: 768px) 100vw, (max-width: 1280px) 55vw, 700px',
  /** Miniaturas verticales de la galería en desktop */
  thumb: '88px',
  /** Hero: ocupa todo el ancho */
  hero: '100vw',
  /** Tarjeta de categoría */
  category: '(max-width: 640px) 45vw, 260px',
  /** Filas del carrito y del panel */
  row: '96px',
} as const

/**
 * Placeholder borroso. Viene embebido en la base (24px en base64), así que no
 * cuesta ni una petición extra.
 */
export function blurProps(blurData: string | null | undefined) {
  return blurData
    ? ({ placeholder: 'blur', blurDataURL: blurData } as const)
    : ({ placeholder: 'empty' } as const)
}

/**
 * Texto alternativo. Si el administrador no lo cargo, se arma uno útil en
 * lugar de dejarlo vacío: una imagen sin alt es una imagen invisible para
 * quien usa lector de pantalla.
 */
export function imageAlt(
  alt: string | null | undefined,
  productName: string,
  index = 0,
): string {
  if (alt && alt.trim()) return alt.trim()
  return index === 0 ? productName : `${productName} — vista ${index + 1}`
}

/* =============================================================================
   LIMITES DE SUBIDA (puntos 51, 141)
   Se validan también en el servidor: el formulario es una cortesía, la
   garantía está en la Server Action.
   ========================================================================== */

export const UPLOAD_LIMITS = {
  image: {
    maxBytes: 8 * 1024 * 1024,
    maxPerProduct: 12,
    maxPerVariant: 4,
    accept: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  },
  video: {
    maxBytes: 25 * 1024 * 1024,
    maxPerProduct: 1,
    maxSeconds: 45,
    accept: ['video/mp4', 'video/webm'],
  },
  proof: {
    maxBytes: 5 * 1024 * 1024,
    maxPerOrder: 3,
    accept: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  },
} as const

/** Derivados que se generan al subir. El original NO se conserva. */
/**
 * Los tamaños que se guardan de cada foto.
 *
 * La miniatura pasó de 480 a 800 px porque 480 no alcanzaba. La tarjeta del
 * catálogo pide `50vw`: en un celular de 400 px con pantalla de 3× eso son
 * **600 píxeles reales**, y el navegador estaba estirando una imagen de 480.
 * Por eso las piezas se veían blandas en el catálogo y nítidas en la ficha.
 *
 * Esto no multiplica lo que se descarga: next/image pide a la CDN de
 * imágenes el ancho exacto que necesita. Lo único que cambia es que ahora el
 * original tiene píxeles suficientes para que esa reducción salga bien.
 *
 * Las calidades subieron porque la foto se comprime DOS veces: una en el
 * navegador al achicarla antes de subir, otra en el servidor. Dos
 * generaciones de pérdida encima de la misma imagen se notan, y en una
 * tienda de piezas tejidas la textura es el producto.
 */
export const IMAGE_DERIVATIVES = {
  main: { maxSide: 1600, quality: 88 },
  thumb: { maxSide: 800, quality: 84 },
  micro: { maxSide: 24, quality: 40 },
} as const

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
