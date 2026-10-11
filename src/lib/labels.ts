import type {
  AvailabilityMode,
  MovementType,
  OrderStatus,
  ProductStatus,
  StockDisplayMode,
} from '@/types/database'
import { etiquetaDeEntrega } from '@/lib/fecha-de-entrega'

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
      // El plazo sale de `etiquetaDeEntrega`, que es la misma fuente que usa la
      // ficha para calcular las fechas. Antes acá decía "~N días" por su
      // cuenta, y la ficha prometía otro número en la pantalla siguiente.
      const plazo = etiquetaDeEntrega(leadTimeDays)
      return {
        label: plazo ? `A pedido · ${plazo}` : 'A pedido',
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

   El vocabulario sale del oficio —nudo, hilo, trama, bastidor, telar— y no de
   un diccionario de sinónimos. Si una frase no la diría alguien que anuda, no
   entra.

   NO SE DICE LANA, Y NO ES UN DETALLE. Acá se trabaja con hilo Kraft, algodón,
   yute y polipropileno. Decir "lana" no es una licencia poética: es nombrar un
   material que no se usa, y la primera que lo nota es la clienta que lo recibe.

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
  /**
   * EL TÍTULO ES UNA AFIRMACIÓN, NO UNA NEGACIÓN.
   *
   * El anterior decía "Nada de esto lo hizo una máquina": definía la tienda por
   * lo que NO es, y le contestaba a una fábrica que nadie había nombrado. Este
   * pone a la persona adelante y dice el oficio.
   */
  titulo: 'Cada nudo lo hago yo.',

  /**
   * Largo a propósito. Es la única pantalla que todos ven, y tiene que
   * contestar las cuatro preguntas de quien llega: qué se vende, de qué está
   * hecho, si entra en su medida, y cuándo lo tiene. A estos precios, no
   * contestarlas acá es perder a la mitad.
   */
  subtitulo:
    'Soy Silvana, de Córdoba. Anudo a mano respaldos de 0,80 a 2,00 m de ancho, ' +
    'espejos, tapices y lámparas. Elegís medida y diseño, te digo cuánto tarda, ' +
    'y llega listo para colgar.',

  /**
   * El detalle de materiales, que se suma al subtítulo desde la primera
   * pantalla que da el alto.
   *
   * En un iPhone SE —568 px de alto— el subtítulo completo empujaba el botón
   * 54 px por debajo del pliegue, y el botón arriba del pliegue es el punto
   * 125. No se pierde nada: los hilos los dicen las frases que giran arriba del
   * título, y tienen su propia página.
   */
  subtituloDetalle: 'Con hilo Kraft, algodón o yute sobre bastidor de madera.',

  /** Invita a encargar, no a mirar. */
  boton: 'Pedí tu medida',

  /**
   * La primera la pone la tienda desde su configuración; éstas siguen.
   * Se muestran en orden y vuelven a empezar.
   *
   * Ninguna pasa de cinco palabras y ninguna dice lana, ovillo ni telar: acá no
   * se teje en telar, se anuda. Los hilos son Kraft, algodón, yute y
   * polipropileno.
   */
  frases: [
    'Nudo por nudo, a mano',
    'Tu medida, mis nudos',
    'Hilo Kraft, algodón y yute',
    'Líneas, Cuadrillé o Nido',
    'Te cuento cuánto tarda',
  ],

  /**
   * Los tres bloques que van debajo del hero y adelantan lo que hay más abajo.
   *
   * El del medio decía "Lana de verdad · Elegida de a ovillo". Era falso: en
   * esta tienda no entra un gramo de lana. Ahora dice los hilos que se usan de
   * verdad, con el mismo argumento de durabilidad que justificaba el bloque.
   */
  adelanto: [
    {
      titulo: 'Una por una',
      texto:
        'Cada pieza sale distinta de la anterior: esas pequeñas diferencias son la ' +
        'firma de la mano que la anudó.',
    },
    {
      titulo: 'Kraft, algodón y yute',
      texto:
        'Hilos elegidos uno por uno y bastidor de madera, para que la pieza siga ' +
        'firme después de años en la pared.',
    },
    {
      titulo: 'Lo hablamos',
      texto:
        'Me escribís con la medida y la idea, y lo definimos entre los dos antes ' +
        'del primer nudo.',
    },
  ],
} as const

/* =============================================================================
   LOS MATERIALES

   La página que explica con qué está hecha cada pieza. Vive acá y no dentro del
   componente por la misma razón que el resto de la copia: es texto que Silvana
   va a querer corregir, y buscarlo entre el maquetado es garantía de que no se
   corrija nunca.

   CADA HILO TERMINA EN PIEZAS CONCRETAS, CON ENLACE.
   Nadie elige un hilo en abstracto. Se entra a leer qué es el yute y se sale
   mirando los espejos de kraft y yute. Las que todavía no tienen categoría
   propia van sin enlace: un enlace a una búsqueda vacía es peor que ninguno.

   LOS COLORES SON LOS DE LA PALETA, NO INVENTADOS.
   La paleta tiene clay, linen, sage y wood. Kraft va en wood —el papel madera—,
   algodón en linen —el crudo—, yute en clay —lo terroso— y polipropileno en
   sage, que es el único que no es una fibra natural y conviene que se distinga.
   ========================================================================== */

export const MATERIALES = {
  /** Lo que dice la pestaña del navegador y el menú. */
  tituloCorto: 'Materiales',

  intro: {
    titulo: 'Todo empieza por el hilo.',
    texto:
      'Cada pieza se arma nudo a nudo sobre madera y fibras naturales, y el hilo ' +
      'que elegís cambia todo lo que viene después: la textura, la caída, el color, ' +
      'cómo se ve ese respaldo en tu pared. Trabajamos con cuatro, y acá te cuento ' +
      'para qué anda mejor cada uno.',
  },

  hilos: [
    {
      nombre: 'Hilo Kraft',
      lema: 'Rusticidad y carácter',
      texto:
        'Es el más firme de los cuatro y el que más se nota: textura de papel ' +
        'madera, color tierra y nudos que quedan marcados. Es el que elige casi ' +
        'todo el mundo para un respaldo, porque a 1,20 m de alto el dibujo tiene ' +
        'que leerse desde la puerta.',
      muestra: 'bg-wood-400/30',
      acento: 'text-wood-500',
      paraQue: [
        { texto: 'Respaldos a medida', href: '/categoria/respaldos' },
        { texto: 'Espejos Kraft', href: '/categoria/espejos' },
        { texto: 'Tapices', href: '/categoria/tapices' },
        { texto: 'Bandejas', href: null },
        { texto: 'Sujeta cortinas', href: null },
      ],
    },
    {
      nombre: 'Hilo de algodón',
      lema: 'Suavidad y caída',
      texto:
        'Suave y flexible: el nudo queda definido y los flecos caen derechos en ' +
        'lugar de abrirse. Es el hilo de las piezas livianas, las que se miran de ' +
        'cerca y se tocan al pasar. Si la pieza va a quedar a la altura de la mano, ' +
        'elegí algodón.',
      muestra: 'bg-linen-200',
      acento: 'text-linen-700',
      paraQue: [
        { texto: 'Espejos', href: '/categoria/espejos' },
        { texto: 'Tapices con flecos', href: '/categoria/tapices' },
        { texto: 'Lámparas', href: null },
        { texto: 'Porta macetas', href: null },
        { texto: 'Atrapa sueños', href: null },
      ],
    },
    {
      nombre: 'Hilo de yute',
      lema: 'Naturalidad y textura orgánica',
      texto:
        'Fibra noble, color natural y una hebra irregular que se nota a un metro de ' +
        'distancia. Va solo con la madera del bastidor, los muebles claros y las ' +
        'plantas, así que casi no hay que pensar el color. Es el hilo para los ' +
        'espacios que ya tienen madera, fibra y verde.',
      muestra: 'bg-clay-200',
      acento: 'text-clay-700',
      paraQue: [
        { texto: 'Espejos Kraft y Yute', href: '/categoria/espejos' },
        { texto: 'Tapices', href: '/categoria/tapices' },
        { texto: 'Porta macetas', href: null },
        { texto: 'Camas colgantes', href: null },
      ],
    },
    {
      nombre: 'Hilo de polipropileno',
      lema: 'Versatilidad y resistencia',
      texto:
        'Es el único al que no le hace nada la humedad, y el que se limpia pasándole ' +
        'un trapo. Viene en varios grosores, colores y acabados, así que es el que ' +
        'sirve cuando hay que igualar un color puntual. Lo elijo para lo que recibe ' +
        'sol, vapor o manos todos los días.',
      muestra: 'bg-sage-100',
      acento: 'text-sage-600',
      paraQue: [
        { texto: 'Camas colgantes', href: null },
        { texto: 'Porta macetas de galería', href: null },
        { texto: 'Tapices para exterior', href: '/categoria/tapices' },
        { texto: 'Lo que haya que limpiar seguido', href: null },
      ],
    },
  ],

  cierre: {
    titulo: 'Si dudás, lo elegimos juntos',
    texto:
      'Contame qué pieza querés, dónde va a estar y qué medidas tenés, y te digo ' +
      'qué hilo le va mejor y cuánto sale. Todo se hace a medida: si tu cama tiene ' +
      'una medida que no está en la lista, casi siempre se puede.',
    boton: 'Escribime por WhatsApp',
  },
} as const

/* =============================================================================
   CONTACTO

   Lo que tenía antes era un "Contacto" como título y una bajada que hablaba de
   "un respaldo para una cama rara". Dos problemas: el título no decía nada, y
   la frase ponía el problema del lado de quien lee —su cama es la rara—. Lo que
   hay que decir es lo contrario: que la medida la pone el cliente y la pieza se
   adapta.

   LOS CUATRO PASOS SON LA PARTE QUE VENDE.
   A estos precios, lo que frena no es el precio: es no saber cómo sigue. Quien
   lee los cuatro pasos sabe que va a ver el precio por escrito antes de pagar
   nada, y eso es lo que hace que escriba.
   ========================================================================== */

export const CONTACTO = {
  overline: 'Del otro lado hay alguien',
  titulo: 'Contame qué tenés en mente',
  bajada:
    'Te contesto yo, la misma persona que después hace la pieza. Preguntar no te ' +
    'compromete a nada: primero vemos medida, diseño y precio, y después decidís.',

  invitacion: {
    titulo: 'Todo se puede hacer a medida',
    texto:
      'No hace falta que la pieza exista en el catálogo. Los respaldos se hacen del ' +
      'ancho de tu cama —de 0,80 a 2,00 m, con 1,20 m de alto, sobre bastidor de ' +
      'madera— y lo mismo vale para espejos, tapices, lámparas y porta macetas: la ' +
      'medida, el diseño y el hilo se eligen de cero. Si tenés una foto del lugar o ' +
      'un color que te guste, mandala: ayuda muchísimo.',
  },

  /** Numerados en la pantalla. El número es el único adorno de la página. */
  pasos: [
    {
      titulo: 'Me escribís',
      texto:
        'Un WhatsApp alcanza. Mandame la medida que necesitás o una foto del lugar ' +
        'donde va la pieza; si no sabés cuánto mide, te digo cómo tomarlo en un minuto.',
    },
    {
      titulo: 'Elegís diseño e hilo',
      texto:
        'Te muestro los tres diseños —Líneas, Cuadrillé y Nido— con fotos de piezas ' +
        'ya hechas, y los hilos: Kraft rústico, algodón suave, yute campestre, ' +
        'polipropileno para lugares húmedos.',
    },
    {
      titulo: 'Te paso precio y fecha',
      texto:
        'Con la medida y el diseño definidos te digo cuánto sale y para cuándo está, ' +
        'por escrito y antes de que pagues nada. Por transferencia o efectivo hay ' +
        'descuento; con tarjeta, cuotas sin interés. Si no te cierra, no pasa nada.',
    },
    {
      titulo: 'La hago y te llega',
      texto:
        'Tu pieza se arma nudo a nudo, de a una. Te mando fotos del avance mientras ' +
        'se hace, y coordinamos la entrega o el envío a tu zona.',
    },
  ],

  cierre: 'Escribime aunque sea para preguntar: de este lado hay una persona con tiempo para contestarte.',
} as const
