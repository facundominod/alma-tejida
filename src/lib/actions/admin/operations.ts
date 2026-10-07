'use server'

import 'server-only'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import type { MovementType, OrderStatus } from '@/types/database'

/**
 * Operación diaria: stock, pedidos, moderación, configuración.
 *
 * Todo lo que mueve inventario o cambia el estado de un pedido pasa por las
 * funciones SQL (adjust_stock, set_order_status), porque necesitan ser
 * transaccionales. Estas acciones son la traducción entre el panel y esas
 * funciones, nada más.
 */

export type AdminResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/** El slug de un producto, para poder invalidar su ficha en la tienda. */
async function productSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string | null | undefined,
): Promise<string | null> {
  if (!productId) return null
  const { data } = await supabase
    .from('products')
    .select('slug')
    .eq('id', productId)
    .maybeSingle()
  return data?.slug ?? null
}

/* =============================================================================
   STOCK  (puntos 57, 58, 130, 131)
   ========================================================================== */

const stockSchema = z.object({
  variantId: z.string().uuid(),
  delta: z.number().int().refine((n) => n !== 0, 'El ajuste no puede ser cero.'),
  type: z.enum(['initial', 'restock', 'adjustment', 'cancellation']).default('adjustment'),
  note: z.string().trim().max(200).optional(),
})

export async function adjustStock(
  input: unknown,
): Promise<
  AdminResult<{ stock: number; reserved: number; available: number }>
> {
  await requireAdmin()

  const parsed = stockSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá el ajuste.' }
  }

  const supabase = await createClient()

  // adjust_stock() escribe el movimiento y el registro de auditoria en la
  // misma transacción: no existe cambio de stock sin rastro.
  const { data, error } = await supabase.rpc('adjust_stock', {
    p_variant_id: parsed.data.variantId,
    p_delta: parsed.data.delta,
    p_type: parsed.data.type as MovementType,
    p_note: parsed.data.note ?? null,
  })

  if (error) {
    if (error.message.includes('FORBIDDEN')) {
      return { ok: false, error: 'No tenés permiso para esta acción.' }
    }
    if (error.message.includes('check constraint')) {
      return {
        ok: false,
        error: 'No se puede dejar el stock en negativo ni por debajo de lo reservado.',
      }
    }
    return { ok: false, error: 'No pudimos actualizar el stock.' }
  }

  const result = data as unknown as {
    stock: number
    reserved: number
    available: number
  }

  revalidatePath('/admin/stock')
  revalidatePath('/admin')

  return {
    ok: true,
    stock: result.stock,
    reserved: result.reserved,
    available: result.available,
  }
}

/** Historial de movimientos de una variante: se lee como un extracto. */
export async function getVariantMovements(variantId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { data } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('variant_id', variantId)
    .order('created_at', { ascending: false })
    .limit(50)

  return data ?? []
}

/* =============================================================================
   PEDIDOS  (puntos 165-171)
   ========================================================================== */

export async function setOrderStatus(
  orderId: string,
  status: OrderStatus,
  note?: string,
): Promise<AdminResult> {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_order_status', {
    p_order_id: orderId,
    p_status: status,
    p_note: note?.trim() || null,
  })

  if (error) {
    if (error.message.includes('INVALID_TRANSITION')) {
      return { ok: false, error: 'Ese cambio de estado no es válido para este pedido.' }
    }
    if (error.message.includes('FORBIDDEN')) {
      return { ok: false, error: 'No tenés permiso para esta acción.' }
    }
    if (error.message.includes('check constraint')) {
      return {
        ok: false,
        error:
          'No alcanza el stock para confirmar esta venta. Revisá el inventario antes de marcarla como pagada.',
      }
    }
    return { ok: false, error: 'No pudimos cambiar el estado del pedido.' }
  }

  revalidatePath(`/admin/pedidos/${orderId}`)
  revalidatePath('/admin/pedidos')
  revalidatePath('/admin')
  revalidatePath('/cuenta/pedidos')

  return { ok: true }
}

/** Nota interna: la ve el administrador, nunca el cliente (punto 167). */
export async function saveInternalNote(
  orderId: string,
  note: string,
): Promise<AdminResult> {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('orders')
    .update({ internal_note: note.trim().slice(0, 2000) || null })
    .eq('id', orderId)

  if (error) return { ok: false, error: 'No pudimos guardar la nota.' }

  revalidatePath(`/admin/pedidos/${orderId}`)
  return { ok: true }
}

/** URL firmada de 60 segundos para ver un comprobante del bucket privado. */
export async function getProofUrl(
  storagePath: string,
): Promise<{ url: string } | { error: string }> {
  await requireAdmin()
  const supabase = await createClient()

  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(storagePath, 60)

  if (error || !data) return { error: 'No pudimos abrir el comprobante.' }
  return { url: data.signedUrl }
}

/* =============================================================================
   MODERACION  (puntos 76, 77, 82)
   ========================================================================== */

const answerSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string().trim().min(1, 'Escribí una respuesta.').max(2000),
  publish: z.boolean(),
})

export async function answerQuestion(input: unknown): Promise<AdminResult> {
  await requireAdmin()

  const parsed = answerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá la respuesta.' }
  }

  const supabase = await createClient()

  // Publicar es una decisión aparte de responder: hay respuestas que solo le
  // sirven a quien pregunto (punto 76).
  const { data, error } = await supabase
    .from('questions')
    .update({
      answer: parsed.data.answer,
      answered_at: new Date().toISOString(),
      status: parsed.data.publish ? 'published' : 'answered',
    })
    .eq('id', parsed.data.questionId)
    .select('product_id')
    .single()

  if (error) return { ok: false, error: 'No pudimos guardar la respuesta.' }

  // La ficha del producto tiene que reflejar la respuesta publicada al momento
  const slug = await productSlug(supabase, data?.product_id)
  if (slug) revalidatePath(`/producto/${slug}`)
  revalidatePath('/admin/preguntas')

  return { ok: true }
}

export async function hideQuestion(questionId: string): Promise<AdminResult> {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('questions')
    .update({ status: 'hidden' })
    .eq('id', questionId)

  if (error) return { ok: false, error: 'No pudimos ocultar la pregunta.' }

  revalidatePath('/admin/preguntas')
  return { ok: true }
}

export async function moderateReview(input: {
  reviewId: string
  action: 'approve' | 'hide'
  reason?: string
  reply?: string
}): Promise<AdminResult> {
  await requireAdmin()

  // Ocultar EXIGE justificarlo. Una crítica no se oculta por ser negativa;
  // si se oculta, queda escrito por que (punto 82). La base también lo exige.
  if (input.action === 'hide' && !input.reason?.trim()) {
    return { ok: false, error: 'Para ocultar una reseña hace falta escribir el motivo.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('reviews')
    .update({
      status: input.action === 'approve' ? 'approved' : 'hidden',
      hidden_reason: input.action === 'hide' ? input.reason!.trim() : null,
      admin_reply: input.reply?.trim() || null,
      replied_at: input.reply?.trim() ? new Date().toISOString() : null,
    })
    .eq('id', input.reviewId)
    .select('product_id')
    .single()

  if (error) return { ok: false, error: 'No pudimos moderar la reseña.' }

  const slug = await productSlug(supabase, data?.product_id)
  if (slug) revalidatePath(`/producto/${slug}`)
  revalidatePath('/admin/resenas')

  return { ok: true }
}

/* =============================================================================
   NOTIFICACIONES  (puntos 98, 99, 153)
   ========================================================================== */

export async function markNotificationRead(notificationId: string): Promise<AdminResult> {
  const supabase = await createClient()

  // RLS ya limita: cada quien solo puede marcar las suyas.
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null)

  if (error) return { ok: false, error: 'No pudimos marcar la notificación.' }

  revalidatePath('/admin', 'layout')
  return { ok: true }
}

export async function markAllNotificationsRead(): Promise<AdminResult> {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('audience', 'admin')
    .is('read_at', null)

  if (error) return { ok: false, error: 'No pudimos marcar las notificaciones.' }

  revalidatePath('/admin', 'layout')
  return { ok: true }
}

/* =============================================================================
   CONFIGURACION DE LA TIENDA  (punto 118)
   ========================================================================== */

const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(160),
  whatsappNumber: z
    .string()
    .trim()
    .max(25)
    .regex(/^[0-9+\s-]*$/, 'El WhatsApp solo puede tener números.')
    .optional(),
  phone: z.string().trim().max(40).optional(),
  contactEmail: z.string().trim().email('Revisá el correo.').or(z.literal('')).optional(),
  address: z.string().trim().max(200).optional(),
  openingHours: z.string().trim().max(200).optional(),
  aboutText: z.string().trim().max(2000).optional(),
  socials: z.record(z.string(), z.string().url().or(z.literal(''))).optional(),
  paymentAlias: z.string().trim().max(60).optional(),
  paymentBank: z.string().trim().max(80).optional(),
  paymentHolder: z.string().trim().max(120).optional(),
  paymentCbu: z.string().trim().max(30).optional(),
  paymentInstructions: z.string().trim().max(600).optional(),
  deliveryMethods: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(40),
        label: z.string().trim().min(1).max(80),
        description: z.string().trim().max(200).optional(),
        requires_address: z.boolean().optional(),
        price: z.number().nonnegative().optional(),
        is_active: z.boolean().optional(),
      }),
    )
    .optional(),
  /**
   * Una casilla vacía significa "no lo cargué", no "quiero que no diga nada".
   *
   * `.transform(v => v || undefined)` borra las cadenas vacías antes de que
   * lleguen a la base. Sin eso se guardaba `{"title": ""}`, y la portada —que
   * elige entre lo cargado y su respaldo con `??`— se quedaba con la cadena
   * vacía, porque `??` sólo cae al respaldo cuando el valor es nulo.
   *
   * Resultado real: guardar la configuración sin tocar estos campos dejaba la
   * portada SIN título, SIN subtítulo y con el botón principal sin texto.
   */
  homeHero: z
    .object({
      title: z.string().trim().max(120).optional().transform((v) => v || undefined),
      subtitle: z.string().trim().max(300).optional().transform((v) => v || undefined),
      cta_label: z.string().trim().max(40).optional().transform((v) => v || undefined),
      cta_href: z.string().trim().max(200).optional().transform((v) => v || undefined),
      image_url: z.string().trim().max(400).optional().transform((v) => v || undefined),
    })
    .optional(),
  defaultStockDisplay: z.enum(['exact', 'vague', 'hidden']).optional(),
  defaultLowStockThreshold: z.number().int().nonnegative().optional(),
  isOpen: z.boolean().optional(),
  closedMessage: z.string().trim().max(300).optional(),
})

export async function updateStoreSettings(input: unknown): Promise<AdminResult> {
  await requireAdmin()

  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá la configuración.' }
  }

  const data = parsed.data
  const supabase = await createClient()

  const { error } = await supabase
    .from('store_settings')
    .update({
      store_name: data.storeName,
      tagline: data.tagline,
      // El número se normaliza a solo digitos: es lo que necesita el enlace
      // de WhatsApp, y evita que un espacio de más rompa el botón.
      whatsapp_number: data.whatsappNumber?.replace(/\D/g, '') || null,
      phone: data.phone || null,
      contact_email: data.contactEmail || null,
      address: data.address || null,
      opening_hours: data.openingHours || null,
      about_text: data.aboutText || null,
      socials: Object.fromEntries(
        Object.entries(data.socials ?? {}).filter(([, url]) => url),
      ),
      payment_alias: data.paymentAlias || null,
      payment_bank: data.paymentBank || null,
      payment_holder: data.paymentHolder || null,
      payment_cbu: data.paymentCbu || null,
      payment_instructions: data.paymentInstructions || null,
      delivery_methods: data.deliveryMethods ?? [],
      home_hero: data.homeHero ?? {},
      default_stock_display: data.defaultStockDisplay ?? 'vague',
      default_low_stock_threshold: data.defaultLowStockThreshold ?? 2,
      is_open: data.isOpen ?? true,
      closed_message: data.closedMessage || null,
    })
    .eq('id', 1)

  if (error) return { ok: false, error: 'No pudimos guardar la configuración.' }

  // La configuración aparece en el header, el pie, el checkout y el
  // seguimiento: se refresca toda la tienda.
  revalidatePath('/', 'layout')

  return { ok: true }
}
