import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createPublicClient } from '@/lib/supabase/public'

/**
 * Endpoint de analíticas.
 *
 * Es una ruta HTTP y no una Server Action porque se invoca con
 * `navigator.sendBeacon`, que solo sabe hacer POST a una URL.
 *
 * No escribe directo en la tabla: llama a track_event(), que aplica el límite
 * de 120 eventos por minuto por sesión y deja que los índices únicos absorban
 * los repetidos del día en silencio.
 */

const schema = z.object({
  event: z.enum([
    'product_view',
    'gallery_image_view',
    'video_play',
    'category_view',
    'search',
    'add_to_cart',
    'checkout_started',
    'order_created',
    'order_paid',
    'whatsapp_click',
  ]),
  session: z.string().min(8).max(64),
  productId: z.string().uuid().nullish(),
  variantId: z.string().uuid().nullish(),
  categoryId: z.string().uuid().nullish(),
  mediaId: z.string().uuid().nullish(),
  // Metadatos acotados: no es un depósito de datos arbitrarios
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json())

    // Una analítica mal formada no es un error que valga la pena reportar:
    // se descarta y listo.
    if (!parsed.success) {
      return new NextResponse(null, { status: 204 })
    }

    const { event, session, productId, variantId, categoryId, mediaId, metadata } =
      parsed.data

    const supabase = createPublicClient()
    await supabase.rpc('track_event', {
      p_event_type: event,
      p_session_id: session,
      p_product_id: productId ?? null,
      p_variant_id: variantId ?? null,
      p_category_id: categoryId ?? null,
      p_media_id: mediaId ?? null,
      p_metadata: metadata ?? {},
    })
  } catch {
    // Que fallen las métricas nunca puede afectar a quien está comprando.
  }

  return new NextResponse(null, { status: 204 })
}
