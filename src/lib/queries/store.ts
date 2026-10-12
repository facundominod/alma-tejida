import 'server-only'

import { cache } from 'react'
import { safeQuery } from '@/lib/queries/safe'
import { createPublicClient } from '@/lib/supabase/public'
import type { Category, ProductThumb, Promotion, StoreSettings } from '@/types/database'

/**
 * Lecturas publicas de la tienda.
 *
 * Todas son tolerantes a fallo: si la base no responde, devuelven un valor
 * vacío razonable en lugar de tirar abajo la página. Una tienda que muestra
 * "no hay productos" es infinitamente mejor que una pantalla de error, y
 * permite que la aplicación compile y arranque antes de que Supabase exista.
 */

/**
 * Valores por defecto de la tienda. Sirven mientras el administrador no haya
 * configurado nada, y como red de seguridad si la base no responde.
 */
const DEFAULT_SETTINGS: StoreSettings = {
  id: 1,
  store_name: 'Alma Tejida',
  tagline: 'Creaciones que unen arte y esencia',
  logo_url: null,
  logo_mark_url: null,
  og_image_url: null,
  whatsapp_number: null,
  phone: null,
  contact_email: null,
  address: null,
  opening_hours: null,
  socials: {},
  payment_alias: null,
  payment_bank: null,
  payment_holder: null,
  payment_cbu: null,
  payment_instructions: null,
  delivery_methods: [],
  home_hero: {},
  home_sections: {},
  about_text: null,
  default_stock_display: 'vague',
  default_low_stock_threshold: 2,
  cash_discount_percent: 20,
  card_installments: 3,
  currency: 'ARS',
  is_open: true,
  closed_message: null,
  updated_at: new Date().toISOString(),
}

/**
 * `cache()` de React deduplica dentro de un mismo render: el header, el footer
 * y la página piden la configuración y la base la ve UNA sola vez.
 */
export const getStoreSettings = cache(async (): Promise<StoreSettings> => {
  return safeQuery(async () => {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('store_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (error || !data) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...data }
  }, DEFAULT_SETTINGS)
})

export const getCategories = cache(async (): Promise<Category[]> => {
  return safeQuery(async () => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('categories')
      .select('*')
      .is('deleted_at', null)
      .eq('is_visible', true)
      .order('position', { ascending: true })
      .order('name', { ascending: true })

    return data ?? []
  }, [])
})

/**
 * Las categorías de primer nivel QUE TIENEN PIEZAS, para la navegación.
 *
 * POR QUÉ SE FILTRAN LAS VACÍAS
 * Una categoría sin piezas es una puerta que da a una pared: se toca "Tapices"
 * y aparece "todavía no hay nada acá". De ocho categorías, seis estaban
 * vacías, así que la navegación prometía seis veces más surtido del que hay y
 * decepcionaba en el clic.
 *
 * No se borran ni se ocultan a mano: en cuanto una categoría tenga una pieza
 * publicada, vuelve sola. Eso es lo que permite cargarlas por adelantado sin
 * que molesten mientras tanto.
 */
export const getTopCategories = cache(async (): Promise<Category[]> => {
  const todas = await getCategories()
  const raices = todas.filter((c) => c.parent_id === null)

  const conPiezas = await safeQuery(async () => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('v_catalog_products')
      .select('category_id')
      .eq('status', 'published')
      .not('category_id', 'is', null)
      .limit(500)

    return new Set((data ?? []).map((f) => f.category_id).filter(Boolean) as string[])
  }, new Set<string>())

  // Si la consulta falla, `conPiezas` viene vacío. En ese caso se muestran
  // TODAS: una navegación de más es molesta; una tienda sin categorías por
  // una consulta caída parece rota.
  if (conPiezas.size === 0) return raices

  return raices.filter((c) => conPiezas.has(c.id))
})

/**
 * Unas fotos de cada categoría, para la portada.
 *
 * EL PROBLEMA QUE RESUELVE
 * El bloque "Por dónde empezar" mostraba la foto de la categoría, y ninguna
 * categoría tiene foto cargada: eran ocho cuadrados en blanco con un nombre
 * debajo. Peor que no tener el bloque, porque parecía algo roto.
 *
 * En vez de pedirle a Silvana que consiga y suba una foto por categoría —otra
 * tarea, y además una foto que no es ninguna pieza de verdad—, se arma un
 * mosaico con las piezas que ya tiene cargadas. Se llena solo: cada vez que
 * sube una pieza nueva, la portada se actualiza.
 *
 * Si la categoría define su propia `image_path`, esa manda: el mosaico es el
 * respaldo, no un reemplazo.
 *
 * UNA SOLA CONSULTA
 * Se traen las portadas de las piezas publicadas y se agrupan acá. Con una
 * consulta por categoría serían ocho viajes a São Paulo para dibujar un bloque
 * que está arriba de todo y bloquea el primer dibujado.
 */
export const getCategoryCollages = cache(
  async (porCategoria = 4): Promise<Record<string, ProductThumb[]>> => {
    return safeQuery(async () => {
      const supabase = createPublicClient()

      const { data } = await supabase
        .from('v_catalog_products')
        .select('category_id, cover_path, cover_thumb, cover_blur, cover_alt, name')
        .eq('status', 'published')
        .not('category_id', 'is', null)
        .not('cover_path', 'is', null)
        .order('is_featured', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(200)

      const porId: Record<string, ProductThumb[]> = {}

      for (const fila of data ?? []) {
        const id = fila.category_id
        if (!id) continue

        const actuales = porId[id] ?? []
        if (actuales.length >= porCategoria) continue

        actuales.push({
          path: fila.cover_path,
          thumb: fila.cover_thumb,
          blur: fila.cover_blur,
          alt: fila.cover_alt ?? fila.name,
        })
        porId[id] = actuales
      }

      return porId
    }, {})
  },
)

export const getCategoryBySlug = cache(
  async (slug: string): Promise<Category | null> => {
    return safeQuery(async () => {
      const supabase = createPublicClient()
      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('slug', slug)
        .is('deleted_at', null)
        .eq('is_visible', true)
        .maybeSingle()

      return data ?? null
    }, null)
  },
)

/**
 * Promociones VIGENTES. La vista ya filtra por fechas: una promoción "activa"
 * con fecha futura o vencida no es vigente y no debe verse.
 */
export const getActivePromotions = cache(async (): Promise<Promotion[]> => {
  return safeQuery(async () => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('v_active_promotions')
      .select('*')
      .order('position', { ascending: true })

    return (data ?? []) as Promotion[]
  }, [])
})

export const getHeroPromotions = cache(async (): Promise<Promotion[]> => {
  const all = await getActivePromotions()
  return all.filter((p) => p.show_in_hero)
})
