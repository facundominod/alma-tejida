'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'

/**
 * Preguntas y reseñas.
 *
 * Nada nace publicado: la moderación la decide el administrador (punto 77).
 * Las policies de RLS ya lo imponen; estas acciones ademas aplican límite de
 * uso y validan la forma del texto antes de molestar a la base.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

const questionSchema = z.object({
  productId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(5, 'Contanos un poco más, así podemos responderte bien.')
    .max(1000, 'La pregunta es demasiado larga.'),
  /** Opcional: si no lo deja, la pregunta sale sin firma. */
  authorName: z.string().trim().max(80).optional(),
  /**
   * WhatsApp o correo. Es la ÚNICA forma de contestarle en privado a alguien
   * que no tiene cuenta, así que si no lo deja, la respuesta sólo le llega si
   * la pregunta se publica. El formulario lo dice.
   */
  authorContact: z.string().trim().max(160).optional(),
  /** El token que el navegador ya guarda para el carrito. Sirve para el tope. */
  visitante: z.string().trim().max(80).optional(),
})

/**
 * Dejar una pregunta sobre una pieza.
 *
 * SIN CUENTA.
 * Antes hacía falta registrarse. Nadie crea una cuenta para preguntar si un
 * respaldo entra en su cama: se va. Y el pedido ya se podía hacer sin cuenta,
 * así que la pregunta —el paso anterior, el más barato— era el único con esa
 * traba.
 *
 * Va por `preguntar()` y no por un insert: la función pone ella el estado
 * —ninguna pregunta nace publicada— y aplica dos topes, uno por visitante y
 * otro para toda la tienda. Ver la migración 0023.
 */
export async function askQuestion(input: unknown): Promise<ActionResult> {
  const parsed = questionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá la pregunta.' }
  }

  const { productId, body, authorName, authorContact, visitante } = parsed.data

  // Si inició sesión, la pregunta queda atada a su cuenta y la ve en "Mis
  // preguntas". Si no, se usa el cliente público: la función no necesita que
  // nadie esté identificado.
  const supabase = await createClient()
  const profile = await getCurrentProfile()

  const { error } = await supabase.rpc('preguntar', {
    p_product_id: productId,
    p_body: body,
    p_author_name: authorName || profile?.full_name || null,
    p_author_contact: authorContact || null,
    p_visitante: visitante || null,
  })

  if (error) {
    const mensaje = error.message ?? ''
    if (mensaje.includes('DEMASIADAS_PREGUNTAS')) {
      return {
        ok: false,
        error: 'Ya mandaste varias preguntas. Probá de nuevo en un rato.',
      }
    }
    if (mensaje.includes('PIEZA_INEXISTENTE')) {
      return { ok: false, error: 'Esa pieza ya no está disponible.' }
    }
    if (mensaje.includes('PREGUNTA_INVALIDA')) {
      return { ok: false, error: 'Revisá la pregunta: es muy corta o muy larga.' }
    }
    return { ok: false, error: 'No pudimos enviar la pregunta. Intentá de nuevo.' }
  }

  // La pregunta queda privada hasta que la publiquen, pero quien tiene cuenta
  // la ve en la ficha.
  const admin = createAdminClient()
  const { data: product } = await admin
    .from('products')
    .select('slug')
    .eq('id', productId)
    .maybeSingle()

  if (product?.slug) revalidatePath(`/producto/${product.slug}`)

  return { ok: true }
}

const reviewSchema = z.object({
  productId: z.string().uuid(),
  orderId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional(),
})

export async function createReview(input: unknown): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Revisá la calificación.' }
  }

  const profile = await getCurrentProfile()
  if (!profile) {
    return { ok: false, error: 'Necesitás iniciar sesión.' }
  }

  const supabase = await createClient()

  // La compra verificada NO se comprueba acá: la impone la policy de RLS,
  // que exige que exista un pedido cobrado del usuario con ese producto.
  // Acá solo se traduce el rechazo a un mensaje entendible.
  const { error } = await supabase.from('reviews').insert({
    product_id: parsed.data.productId,
    order_id: parsed.data.orderId,
    user_id: profile.id,
    author_name: profile.full_name,
    rating: parsed.data.rating,
    body: parsed.data.body || null,
    status: 'pending',
  })

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Ya dejaste una reseña de esta compra.' }
    }
    return {
      ok: false,
      error: 'Solo se pueden resenar piezas que hayas comprado.',
    }
  }

  revalidatePath('/cuenta/pedidos')
  return { ok: true }
}

const restockSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullish(),
  email: z.string().trim().email('Revisá el correo.'),
})

/**
 * "Avisame cuando vuelva" (punto 185).
 *
 * Una consulta simple, no un sistema de marketing. Se inserta con el cliente
 * de servicio porque RLS no le da acceso a esta tabla a nadie: listarla
 * expondría correos de otras personas.
 */
export async function requestRestock(input: unknown): Promise<ActionResult> {
  const parsed = restockSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá los datos.' }
  }

  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `restock:${parsed.data.email.toLowerCase()}`,
    p_max: 5,
    p_window_seconds: 3600,
  })

  if (allowed === false) {
    return { ok: false, error: 'Ya registramos tu consulta. Te avisamos apenas vuelva.' }
  }

  const profile = await getCurrentProfile()
  const admin = createAdminClient()

  const { error } = await admin.from('restock_requests').insert({
    product_id: parsed.data.productId,
    variant_id: parsed.data.variantId ?? null,
    user_id: profile?.id ?? null,
    email: parsed.data.email.toLowerCase(),
  })

  // 23505 = ya existe una consulta sin notificar para esa pieza y ese correo.
  // Para la persona el resultado es el mismo: quedo anotada.
  if (error && error.code !== '23505') {
    return { ok: false, error: 'No pudimos registrar la consulta.' }
  }

  return { ok: true }
}
