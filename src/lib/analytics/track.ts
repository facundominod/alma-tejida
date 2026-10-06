'use client'

import type { AnalyticsEventType } from '@/types/database'

/**
 * Analíticas del negocio, no vigilancia (punto 93).
 *
 * Se registran los eventos que hacen falta para administrar la tienda: que
 * piezas se miran, cuales se agregan al carrito, donde se corta la compra.
 * No se registra el movimiento del mouse, ni el scroll, ni nada que permita
 * identificar a una persona.
 *
 * El identificador de sesión es aleatorio, vive en sessionStorage y muere al
 * cerrar la pestana. No hay cookie de seguimiento, no hay huella digital, no
 * hay servicios de terceros.
 *
 * La deduplicación de verdad ocurre en la base: un índice único por
 * (sesión, producto, día) hace que apretar F5 cincuenta veces sume UNA visita
 * (punto 174). Esta cola local solo evita llamadas obviamente repetidas.
 */

const SESSION_KEY = 'alma-tejida:sesion'
const sentThisPage = new Set<string>()

function sessionId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = crypto.randomUUID()
      window.sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return ''
  }
}

export type TrackPayload = {
  productId?: string | null
  variantId?: string | null
  categoryId?: string | null
  mediaId?: string | null
  metadata?: Record<string, unknown>
}

export async function trackEvent(
  event: AnalyticsEventType,
  payload: TrackPayload = {},
): Promise<void> {
  if (typeof window === 'undefined') return

  const session = sessionId()
  if (!session) return

  // Misma clave en la misma vista: no hace falta molestar al servidor
  const key = [event, payload.productId, payload.variantId, payload.mediaId].join(':')
  if (sentThisPage.has(key)) return
  sentThisPage.add(key)

  const body = JSON.stringify({ event, session, ...payload })

  try {
    // sendBeacon sobrevive a que la persona se vaya de la página y no
    // compite con las peticiones que si importan.
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        '/api/analytics',
        new Blob([body], { type: 'application/json' }),
      )
      if (ok) return
    }

    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    })
  } catch {
    // Si falla, se pierde un evento. No es motivo para molestar a nadie.
  }
}

/** Se llama al cambiar de página para que los eventos vuelvan a poder enviarse. */
export function resetPageTracking() {
  sentThisPage.clear()
}
