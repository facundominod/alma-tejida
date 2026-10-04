'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import type { CreateOrderResult } from '@/types/database'

/**
 * Creación de pedidos.
 *
 * Esta acción NO calcula precios, NO descuenta stock y NO decide si algo esta
 * disponible. Todo eso ocurre dentro de create_order(), en una única
 * transacción de PostgreSQL. Acá solo se arma el carrito del lado del
 * servidor y se traduce el resultado a un mensaje entendible.
 *
 * Reparar en lo que el navegador manda: `variantId` y `quantity`. Nada más.
 * No hay campo de precio ni de total: no existe donde escribir una mentira.
 */

const lineSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
})

const placeOrderSchema = z.object({
  lines: z.array(lineSchema).min(1, 'Tu carrito está vacío.').max(50),
  customerName: z.string().trim().min(2, 'Necesitamos tu nombre.').max(120),
  customerEmail: z.string().trim().toLowerCase().email('Revisá el correo.'),
  customerPhone: z
    .string()
    .trim()
    .min(6, 'Necesitamos un teléfono para coordinar.')
    .max(40),
  deliveryMethod: z.string().trim().max(60).optional(),
  shippingAddress: z
    .object({
      street: z.string().trim().max(160).optional(),
      city: z.string().trim().max(80).optional(),
      province: z.string().trim().max(80).optional(),
      postalCode: z.string().trim().max(20).optional(),
      notes: z.string().trim().max(300).optional(),
    })
    .optional(),
  customerNote: z.string().trim().max(600).optional(),
  /** Generado al ABRIR el checkout. Es lo que hace idempotente la operación. */
  idempotencyKey: z.string().uuid(),
  anonToken: z.string().min(8).max(80),
})

export type PlaceOrderResult =
  | {
      ok: true
      orderNumber: string
      accessToken: string
      orderId: string
      total: number
      duplicate: boolean
    }
  | { ok: false; error: string; unavailableVariantId?: string }

export async function placeOrder(input: unknown): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Revisá los datos del pedido.',
    }
  }

  const data = parsed.data
  const profile = await getCurrentProfile()
  const supabase = await createClient()

  // 5 pedidos por hora por sesión: más que suficiente para alguien comprando
  // de verdad, un techo claro para cualquier abuso.
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `order:${profile?.id ?? data.anonToken}`,
    p_max: 5,
    p_window_seconds: 3600,
  })

  if (allowed === false) {
    return {
      ok: false,
      error: 'Hiciste varios pedidos seguidos. Esperá un momento e intentá de nuevo.',
    }
  }

  // El carrito del visitante vive en localStorage; RLS no puede identificarlo.
  // Por eso se materializa acá, en el servidor, justo antes de convertirlo en
  // pedido. Es el único lugar donde hace falta el cliente de servicio.
  const admin = createAdminClient()

  try {
    const cartId = await buildServerCart(admin, {
      userId: profile?.id ?? null,
      anonToken: data.anonToken,
      lines: data.lines,
    })

    const { data: result, error } = await admin.rpc('create_order', {
      p_cart_id: cartId,
      p_idempotency_key: data.idempotencyKey,
      p_customer_name: data.customerName,
      p_customer_email: data.customerEmail,
      p_customer_phone: data.customerPhone,
      p_anon_token: profile ? null : data.anonToken,
      p_delivery_method: data.deliveryMethod ?? null,
      p_shipping_address: data.shippingAddress ?? null,
      p_customer_note: data.customerNote ?? null,
    })

    if (error) return translateOrderError(error.message)

    const order = result as unknown as CreateOrderResult

    revalidatePath('/cuenta/pedidos')

    return {
      ok: true,
      orderNumber: order.order_number,
      accessToken: order.access_token,
      orderId: order.order_id,
      total: Number(order.total),
      duplicate: order.duplicate,
    }
  } catch (error) {
    return translateOrderError((error as Error).message)
  }
}

/**
 * Deja el carrito del servidor con EXACTAMENTE las líneas que mando el
 * navegador. Si el usuario tiene cuenta, se reusa su carrito activo (así el
 * pedido queda asociado a el); si no, se crea uno atado al token anonimo.
 */
async function buildServerCart(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    userId: string | null
    anonToken: string
    lines: Array<{ variantId: string; quantity: number }>
  },
): Promise<string> {
  const { userId, anonToken, lines } = params

  const { data: existing } = await admin
    .from('carts')
    .select('id')
    .eq('status', 'active')
    .eq(userId ? 'user_id' : 'anon_token', userId ?? anonToken)
    .maybeSingle()

  let cartId = existing?.id

  if (!cartId) {
    const { data: created, error } = await admin
      .from('carts')
      .insert(userId ? { user_id: userId } : { anon_token: anonToken })
      .select('id')
      .single()

    if (error || !created) throw new Error('CART_CREATE_FAILED')
    cartId = created.id
  }

  // Se reemplaza el contenido: el carrito del servidor es un reflejo del que
  // la persona esta viendo, no un acumulado de intentos anteriores.
  await admin.from('cart_items').delete().eq('cart_id', cartId)

  const { error: insertError } = await admin.from('cart_items').insert(
    lines.map((line) => ({
      cart_id: cartId!,
      variant_id: line.variantId,
      quantity: line.quantity,
    })),
  )

  if (insertError) throw new Error('CART_ITEMS_FAILED')

  return cartId
}

/**
 * Los errores de la base vienen como codigos (OUT_OF_STOCK:uuid). Acá se
 * traducen a algo que una persona pueda leer y accionar.
 */
function translateOrderError(message: string): PlaceOrderResult {
  if (message.includes('OUT_OF_STOCK')) {
    const variantId = message.split('OUT_OF_STOCK:')[1]?.split(/\s/)[0]
    return {
      ok: false,
      error:
        'Se agotó mientras completabas el pedido. Lo sacamos del carrito y podés seguir con el resto.',
      unavailableVariantId: variantId,
    }
  }

  if (message.includes('PRODUCT_UNAVAILABLE')) {
    const variantId = message.split('PRODUCT_UNAVAILABLE:')[1]?.split(/\s/)[0]
    return {
      ok: false,
      error: 'Una de las piezas dejó de estar disponible. La sacamos del carrito.',
      unavailableVariantId: variantId,
    }
  }

  if (message.includes('CART_EMPTY')) {
    return { ok: false, error: 'Tu carrito está vacío.' }
  }

  if (message.includes('FORBIDDEN')) {
    return { ok: false, error: 'No pudimos validar tu carrito. Recargá la página.' }
  }

  return {
    ok: false,
    error: 'No pudimos crear el pedido. Probá de nuevo en un momento.',
  }
}

/* =============================================================================
   CANCELAR (cliente)
   ========================================================================== */

export async function cancelMyOrder(
  orderId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Necesitás iniciar sesión.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_order_by_customer', {
    p_order_id: orderId,
    p_reason: reason ?? null,
  })

  if (error) {
    if (error.message.includes('NOT_CANCELLABLE')) {
      return {
        ok: false,
        error: 'Este pedido ya no se puede cancelar desde acá. Escribinos y lo vemos.',
      }
    }
    return { ok: false, error: 'No pudimos cancelar el pedido.' }
  }

  revalidatePath('/cuenta/pedidos')
  return { ok: true }
}

/* =============================================================================
   FUSION DE CARRITO AL INICIAR SESION (punto 71)
   ========================================================================== */

export async function mergeCartOnLogin(
  lines: Array<{ variantId: string; quantity: number }>,
): Promise<{ ok: boolean }> {
  const profile = await getCurrentProfile()
  if (!profile || lines.length === 0) return { ok: false }

  const parsed = z.array(lineSchema).max(50).safeParse(lines)
  if (!parsed.success) return { ok: false }

  const supabase = await createClient()

  // RLS alcanza: el usuario solo puede tocar su propio carrito.
  const { data: cart } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .maybeSingle()

  let cartId = cart?.id
  if (!cartId) {
    const { data: created } = await supabase
      .from('carts')
      .insert({ user_id: profile.id })
      .select('id')
      .single()
    cartId = created?.id
  }

  if (!cartId) return { ok: false }

  for (const line of parsed.data) {
    await supabase
      .from('cart_items')
      .upsert(
        { cart_id: cartId, variant_id: line.variantId, quantity: line.quantity },
        { onConflict: 'cart_id,variant_id' },
      )
  }

  // Los pedidos que hizo como invitado con este mismo correo pasan a su cuenta
  await supabase.rpc('link_guest_orders')

  return { ok: true }
}
