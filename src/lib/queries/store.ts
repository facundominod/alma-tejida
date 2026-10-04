import 'server-only'

import { cache } from 'react'
import { safeQuery } from '@/lib/queries/safe'
import { createPublicClient } from '@/lib/supabase/public'
import type { Category, Promotion, StoreSettings } from '@/types/database'

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

/** Solo categorías de primer nivel, para la navegación. */
export const getTopCategories = cache(async (): Promise<Category[]> => {
  const all = await getCategories()
  return all.filter((c) => c.parent_id === null)
})

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
