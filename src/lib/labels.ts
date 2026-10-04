import type {
  AvailabilityMode,
  MovementType,
  OrderStatus,
  ProductStatus,
  StockDisplayMode,
} from '@/types/database'

/**
 * Todo el texto que ve una persona vive acá.
 *
 * El esquema esta en ingles (SQL sin acentos ni ñ), la interfaz en espanol.
 * Centralizarlo permite cambiar terminologia sin tocar la base ni buscar
 * cadenas sueltas por veinte componentes.
 */

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pedido recibido',
  contacted: 'Te contactamos',
  awaiting_payment: 'Esperando pago',
  paid: 'Pago confirmado',
  preparing: 'Preparando',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

/** Versión corta para chips y tablas del panel. */
export const ORDER_STATUS_SHORT: Record<OrderStatus, string> = {
  pending: 'Nuevo',
  contacted: 'Contactado',
  awaiting_payment: 'Esperando pago',
  paid: 'Pagado',
  preparing: 'Preparando',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export const ORDER_STATUS_TONE: Record<
  OrderStatus,
  'neutral' | 'primary' | 'success' | 'warning' | 'danger'
> = {
  pending: 'primary',
  contacted: 'neutral',
  awaiting_payment: 'warning',
  paid: 'success',
  preparing: 'success',
  delivered: 'success',
  cancelled: 'danger',
}

/** Orden real del flujo, para el timeline del cliente. */
export const ORDER_FLOW: OrderStatus[] = [
  'pending',
  'contacted',
  'awaiting_payment',
  'paid',
  'preparing',
  'delivered',
]

/** Transiciones permitidas. Es el espejo exacto de set_order_status() en SQL. */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['contacted', 'awaiting_payment', 'paid', 'cancelled'],
  contacted: ['awaiting_payment', 'paid', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['preparing', 'delivered', 'cancelled'],
  preparing: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
}

export const AVAILABILITY_LABEL: Record<AvailabilityMode, string> = {
  in_stock: 'Con stock',
  made_to_order: 'A pedido',
  unique_piece: 'Pieza única',
}

export const STOCK_DISPLAY_LABEL: Record<StockDisplayMode, string> = {
  exact: 'Mostrar la cantidad exacta',
  vague: 'Mostrar solo si hay o no hay',
  hidden: 'No mostrar cantidades',
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  initial: 'Carga inicial',
  restock: 'Ingreso',
  reserve: 'Reserva',
  release: 'Liberación',
  sale: 'Venta',
  cancellation: 'Cancelación',
  adjustment: 'Ajuste',
}

export const NOTIFICATION_LABEL: Record<string, string> = {
  order_created: 'Nuevo pedido',
  order_cancelled: 'Pedido cancelado',
  order_status: 'Cambio de estado',
  question_asked: 'Nueva pregunta',
  question_answered: 'Pregunta respondida',
  review_created: 'Nueva reseña',
  low_stock: 'Stock bajo',
  payment_proof: 'Comprobante recibido',
}

/* =============================================================================
   DISPONIBILIDAD
   El administrador decide por producto cuanto detalle ve el cliente.
   ========================================================================== */

export type AvailabilityView = {
  label: string
  tone: 'success' | 'warning' | 'danger' | 'neutral'
  canBuy: boolean
}

export function availabilityView(params: {
  mode: AvailabilityMode
  display: StockDisplayMode
  available: number
  threshold: number
  leadTimeDays?: number | null
}): AvailabilityView {
  const { mode, display, available, threshold, leadTimeDays } = params

  // Para una pieza única el mensaje correcto no es "sin stock": es que esa
  // pieza ya tiene dueño.
  if (mode === 'unique_piece') {
    return available > 0
      ? { label: 'Pieza única', tone: 'success', canBuy: true }
      : { label: 'Esta pieza ya encontro su casa', tone: 'neutral', canBuy: false }
  }

  if (available <= 0) {
    if (mode === 'made_to_order') {
      return {
        label: leadTimeDays ? `A pedido · ~${leadTimeDays} días` : 'A pedido',
        tone: 'warning',
        canBuy: true,
      }
    }
    return { label: 'Sin stock por ahora', tone: 'danger', canBuy: false }
  }

  if (display === 'exact') {
    return {
      label: available === 1 ? 'Queda 1 disponible' : `${available} disponibles`,
      tone: available <= threshold ? 'warning' : 'success',
      canBuy: true,
    }
  }

  if (display === 'vague' && available <= threshold) {
    return {
      label: available === 1 ? 'Última unidad' : `Últimas ${available} unidades`,
      tone: 'warning',
      canBuy: true,
    }
  }

  return { label: 'Disponible', tone: 'success', canBuy: true }
}

/* =============================================================================
   MICROCOPY
   Calido, simple, profesional. Sin cursileria.
   ========================================================================== */

export const COPY = {
  emptyCart: 'Tu carrito todavía está vacío.',
  emptyCartAction: 'Ver productos',
  emptyCatalog: 'No encontramos piezas con ese filtro.',
  emptyCatalogAction: 'Limpiar filtros',
  emptySearch: (q: string) => `No encontramos nada para "${q}".`,
  emptyOrders: 'Todavía no hiciste ningun pedido.',
  emptyQuestions: 'Todavía no hay preguntas sobre esta pieza.',
  emptyReviews: 'Esta pieza todavía no tiene reseñas.',
  notFound: 'Esta página se soltó del telar.',
  notFoundAction: 'Volver al inicio',
  networkError: 'No pudimos conectar. Revisá tu conexión e intentá de nuevo.',
  outOfStockDuringCheckout:
    'Se agoto mientras completabas el pedido. Lo sacamos del carrito.',
  genericError: 'Algo no salio bien. Probá de nuevo en un momento.',
  orderCreated: (n: string) => `Listo. Tu pedido es el ${n}.`,
  askAboutRestock: 'Consultar si vuelve',
} as const
