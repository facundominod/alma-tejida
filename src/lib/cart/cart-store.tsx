'use client'

import * as React from 'react'

/**
 * Carrito del visitante.
 *
 * Vive en localStorage: sobrevive al cierre del navegador (punto 72) y no
 * necesita cuenta (punto 9). RLS no puede distinguir a un anonimo de otro,
 * así que no se intenta: el carrito se materializa en la base recien al
 * confirmar el pedido, del lado del servidor.
 *
 * Esta implementado como un STORE EXTERNO leido con useSyncExternalStore, y
 * no con useState + useEffect. localStorage ES un sistema externo a React:
 * tratarlo como tal resuelve de una tres cosas que con efectos hay que
 * programar a mano y salen mal:
 *   · la hidratación (el servidor renderiza un carrito vacío y el cliente lo
 *     sincroniza sin desajustes);
 *   · dos pestanas abiertas mostrando el mismo carrito;
 *   · cero renders en cascada al arrancar.
 *
 * ⚠️  Los precios guardados acá son SOLO PARA MOSTRAR. Al crear el pedido, el
 * servidor los recalcula con effective_price() y descarta cualquier cosa que
 * haya mandado el navegador (punto 108).
 */

const STORAGE_KEY = 'alma-tejida:carrito:v1'
const TOKEN_KEY = 'alma-tejida:visitante:v1'
const MAX_QTY = 99

export type CartLine = {
  variantId: string
  productId: string
  slug: string
  name: string
  variantLabel: string | null
  image: string | null
  /** Solo para mostrar. La verdad la tiene el servidor. */
  price: number
  listPrice: number | null
  quantity: number
  /** Disponible al momento de agregar; se revalida siempre en el servidor. */
  maxAvailable: number | null
  madeToOrder: boolean
}

type Snapshot = {
  lines: CartLine[]
  /** false hasta leer localStorage: evita parpadeos e hidratación incorrecta */
  ready: boolean
  anonToken: string
}

/* =============================================================================
   EL STORE
   Vive a nivel de modulo, fuera de React. React sólo se suscribe.
   ========================================================================== */

const EMPTY: Snapshot = { lines: [], ready: false, anonToken: '' }

let snapshot: Snapshot = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function readStored(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    // Se valida la forma: un localStorage corrupto no puede romper la tienda.
    return parsed.filter(
      (line): line is CartLine =>
        typeof line === 'object' &&
        line !== null &&
        typeof (line as CartLine).variantId === 'string' &&
        typeof (line as CartLine).quantity === 'number' &&
        (line as CartLine).quantity > 0,
    )
  } catch {
    return []
  }
}

function readToken(): string {
  try {
    let token = window.localStorage.getItem(TOKEN_KEY)
    if (!token) {
      token = crypto.randomUUID()
      window.localStorage.setItem(TOKEN_KEY, token)
    }
    return token
  } catch {
    // Modo privado: se genera uno efimero. El carrito no sobrevive al cierre,
    // pero la compra de esta sesión funciona igual.
    return crypto.randomUUID()
  }
}

function persist(lines: CartLine[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  } catch {
    // Almacenamiento lleno o bloqueado: la tienda sigue andando, el carrito
    // simplemente no sobrevive al cierre del navegador.
  }
}

function emit() {
  for (const listener of listeners) listener()
}

function setLines(next: CartLine[], write = true) {
  snapshot = { lines: next, ready: true, anonToken: snapshot.anonToken }
  if (write) persist(next)
  emit()
}

function onStorageEvent(event: StorageEvent) {
  // Otra pestana cambio el carrito
  if (event.key === STORAGE_KEY) setLines(readStored(), false)
}

function subscribe(listener: () => void): () => void {
  // La primera suscripción carga desde localStorage. Ocurre después del
  // montaje, que es exactamente cuando useSyncExternalStore lo permite.
  if (!loaded) {
    loaded = true
    snapshot = { lines: readStored(), ready: true, anonToken: readToken() }
  }

  listeners.add(listener)
  if (listeners.size === 1) {
    window.addEventListener('storage', onStorageEvent)
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('storage', onStorageEvent)
    }
  }
}

const getSnapshot = () => snapshot
const getServerSnapshot = () => EMPTY

/* =============================================================================
   OPERACIONES
   ========================================================================== */

function capFor(line: Pick<CartLine, 'madeToOrder' | 'maxAvailable'>) {
  // Un producto a pedido no tiene tope de stock: se fabrica.
  return Math.min(line.madeToOrder ? MAX_QTY : (line.maxAvailable ?? MAX_QTY), MAX_QTY)
}

function addLine(line: Omit<CartLine, 'quantity'>, quantity = 1) {
  const current = snapshot.lines
  const existing = current.find((l) => l.variantId === line.variantId)

  if (existing) {
    setLines(
      current.map((l) =>
        l.variantId === line.variantId
          ? { ...l, ...line, quantity: Math.min(l.quantity + quantity, capFor(line)) }
          : l,
      ),
    )
    return
  }

  setLines([...current, { ...line, quantity: Math.min(quantity, capFor(line)) }])
}

function setQuantity(variantId: string, quantity: number) {
  const current = snapshot.lines

  if (quantity <= 0) {
    setLines(current.filter((l) => l.variantId !== variantId))
    return
  }

  setLines(
    current.map((l) =>
      l.variantId === variantId ? { ...l, quantity: Math.min(quantity, capFor(l)) } : l,
    ),
  )
}

function removeLine(variantId: string) {
  setLines(snapshot.lines.filter((l) => l.variantId !== variantId))
}

function clearCart() {
  setLines([])
}

/** Cambia una línea por otra variante del mismo producto (punto 70). */
function replaceVariant(oldVariantId: string, line: Omit<CartLine, 'quantity'>) {
  const current = snapshot.lines
  const old = current.find((l) => l.variantId === oldVariantId)
  if (!old) return

  const withoutOld = current.filter((l) => l.variantId !== oldVariantId)
  const existing = withoutOld.find((l) => l.variantId === line.variantId)

  if (existing) {
    setLines(
      withoutOld.map((l) =>
        l.variantId === line.variantId
          ? { ...l, quantity: Math.min(l.quantity + old.quantity, capFor(l)) }
          : l,
      ),
    )
    return
  }

  setLines([...withoutOld, { ...line, quantity: Math.min(old.quantity, capFor(line)) }])
}

/* =============================================================================
   REACT
   ========================================================================== */

type CartState = Snapshot & {
  count: number
  subtotal: number
  listSubtotal: number
  discount: number
  add: typeof addLine
  setQuantity: typeof setQuantity
  remove: typeof removeLine
  clear: typeof clearCart
  replaceVariant: typeof replaceVariant
  isOpen: boolean
  open: () => void
  close: () => void
}

const CartContext = React.createContext<CartState | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const store = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // El panel lateral SI es estado de interfaz: vive en React.
  const [isOpen, setIsOpen] = React.useState(false)

  const value = React.useMemo<CartState>(() => {
    const count = store.lines.reduce((sum, line) => sum + line.quantity, 0)
    const subtotal = store.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
    const listSubtotal = store.lines.reduce(
      (sum, line) => sum + (line.listPrice ?? line.price) * line.quantity,
      0,
    )

    return {
      ...store,
      count,
      subtotal,
      listSubtotal,
      discount: Math.max(listSubtotal - subtotal, 0),
      // Agregar algo abre el carrito: es la confirmación de que paso.
      add: (line, quantity) => {
        addLine(line, quantity)
        setIsOpen(true)
      },
      setQuantity,
      remove: removeLine,
      clear: clearCart,
      replaceVariant,
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }
  }, [store, isOpen])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartState {
  const context = React.useContext(CartContext)
  if (!context) {
    throw new Error('useCart tiene que usarse dentro de <CartProvider>')
  }
  return context
}
