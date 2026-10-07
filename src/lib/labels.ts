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
      : { label: 'Esta pieza ya encontró su casa', tone: 'neutral', canBuy: false }
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
   MICROCOPY — LA VOZ DE LA CASA

   Una sola regla: la METÁFORA va en el título, la INSTRUCCIÓN va debajo.
   Nunca dos imágenes seguidas, y nunca una imagen sola cuando la persona
   necesita saber qué hacer. "Se cortó el hilo" es lindo; "revisá tu conexión"
   es lo que resuelve el problema. Van juntas o no van.

   El vocabulario sale del oficio —telar, hilo, madeja, trama, bastidor— y no
   de un diccionario de sinónimos. Si una frase no la diría alguien que teje,
   no entra.

   Todo el texto vive acá para que cambiar el tono de la tienda sea editar un
   archivo, y no buscar cadenas sueltas por veinte componentes.
   ========================================================================== */

export const COPY = {
  /* --- Carrito ----------------------------------------------------------- */
  emptyCart: 'Tu carrito todavía no tiene ni un hilo.',
  emptyCartHint: 'Cuando encuentres una pieza que te guste, va a aparecer acá.',
  emptyCartAction: 'Ver las piezas',

  /* --- Catálogo: no hay resultados PARA LO QUE PIDIÓ --------------------- */
  emptyCatalog: 'Ningún hilo coincide con esa búsqueda.',
  emptyCatalogHint: 'Probá sacando algún filtro, o mirá el catálogo entero.',
  emptyCatalogAction: 'Limpiar filtros',
  emptySearch: (q: string) => `Buscamos en toda la madeja y no apareció «${q}».`,

  /* --- Catálogo: todavía no hay NADA cargado ---------------------------- */
  catalogComingSoon: 'Las primeras piezas todavía están en el telar.',
  catalogComingSoonHint: 'En cuanto estén listas, van a aparecer acá.',
  emptyCategory: 'Esta categoría todavía está en el bastidor.',
  emptyCategoryHint: 'Acá no hay piezas por ahora. Mirá el resto del catálogo.',
  emptyOffers: 'Por ahora el telar está a precio de siempre.',
  emptyOffersHint: 'Cuando haya una promoción, va a aparecer acá.',

  /* --- Cuenta ------------------------------------------------------------ */
  emptyOrders: 'Tu primera pieza todavía no salió del taller.',
  emptyOrdersHint: 'Cuando hagas un pedido, vas a poder seguirlo desde acá.',

  /* --- Ficha de producto ------------------------------------------------- */
  emptyQuestions: 'Nadie tiró del hilo todavía.',
  emptyQuestionsHint: 'Si hay algo que no queda claro, preguntá: te contestamos nosotros.',
  emptyReviews: 'Todavía nadie contó cómo le quedó en casa.',
  emptyReviewsHint: 'Las reseñas las escriben quienes ya recibieron su pedido.',

  /* --- Cuando algo sale mal ---------------------------------------------- */
  notFound: 'Esta página se soltó del telar.',
  notFoundHint: 'Puede que la pieza ya no esté publicada, o que el enlace tenga algo raro.',
  notFoundAction: 'Volver al inicio',

  networkError: 'Se cortó el hilo.',
  networkErrorHint: 'Revisá tu conexión e intentá de nuevo.',

  genericError: 'Se nos enredó la madeja.',
  genericErrorHint: 'Probá de nuevo en un momento.',

  serverError: 'Se nos trabó el telar.',
  serverErrorHint: 'El problema es nuestro, no tuyo. Dale un minuto y volvé a intentar.',
  serverErrorAction: 'Reintentar',

  /* --- Pedido ------------------------------------------------------------
     Estos cinco los devuelve `translateOrderError` en src/lib/actions/order.ts
     al traducir los códigos que lanza create_order(). Viven acá como todo el
     resto: el servidor decide QUÉ pasó, este archivo decide CÓMO se cuenta.
     -------------------------------------------------------------------- */
  outOfStockDuringCheckout:
    'Alguien se la llevó mientras completabas el pedido. La sacamos del carrito y podés seguir con el resto.',
  productUnavailable: 'Una de las piezas dejó de estar disponible. La sacamos del carrito.',
  cartEmptyAtCheckout: 'Tu carrito quedó sin nada que pedir.',
  cartNotYours: 'No pudimos validar tu carrito. Recargá la página y probá otra vez.',
  orderFailed: 'No pudimos cerrar el pedido. Probá de nuevo en un momento.',
  orderCreated: (n: string) => `Listo. Tu pedido es el ${n}.`,
  askAboutRestock: 'Consultar si vuelve',

  /* --- Espera ------------------------------------------------------------ */
  loading: 'Pasando la trama…',
} as const

/* =============================================================================
   LA PORTADA

   El título y el subtítulo de acá son el RESPALDO: si el administrador cargó
   los suyos en /admin/configuracion, mandan los suyos. Estos son los que ve
   una tienda recién instalada, y tienen que estar a la altura igual.

   Las frases de arriba giran. Son cortas a propósito: una línea que cambia
   sola y que hay que terminar de leer antes de que se vaya es una línea que
   molesta. Ninguna pasa de cinco palabras.
   ========================================================================== */

export const PORTADA = {
  titulo: 'Nada de esto lo hizo una máquina.',
  subtitulo:
    'Respaldos, espejos y tapices tejidos de a uno, con lana de verdad y el tiempo que haga falta.',
  boton: 'Ver las piezas',

  /**
   * La primera la pone la tienda desde su configuración; éstas siguen.
   * Se muestran en orden y vuelven a empezar.
   */
  frases: [
    'Una pieza por vez, sin apuro',
    'Lana de verdad, tiempo de verdad',
    'Nada sale dos veces igual',
    'Recién salidas del telar',
  ],
} as const
