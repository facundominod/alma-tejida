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
})

export async function askQuestion(input: unknown): Promise<ActionResult> {
  const parsed = questionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá la pregunta.' }
  }

  const profile = await getCurrentProfile()
  if (!profile) {
    return { ok: false, error: 'Necesitás una cuenta para preguntar.' }
  }

  const supabase = await createClient()

  // 5 preguntas por hora por persona: suficiente para cualquiera que este
  // comprando de verdad, insuficiente para inundar la bandeja del admin.
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `question:${profile.id}`,
    p_max: 5,
    p_window_seconds: 3600,
  })

  if (allowed === false) {
    return {
      ok: false,
      error: 'Ya enviaste varias preguntas. Probá de nuevo en un rato.',
    }
  }

  const { error } = await supabase.from('questions').insert({
    product_id: parsed.data.productId,
    user_id: profile.id,
    author_name: profile.full_name,
    body: parsed.data.body,
    status: 'pending',
  })

  if (error) {
    return { ok: false, error: 'No pudimos enviar la pregunta. Intentá de nuevo.' }
  }

  // La pregunta queda privada hasta que el admin la publique, pero quien
  // pregunto tiene que verla en la ficha.
  const { data: product } = await supabase
    .from('products')
    .select('slug')
    .eq('id', parsed.data.productId)
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
