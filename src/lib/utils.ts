import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Combina clases resolviendo conflictos de Tailwind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Precio en pesos argentinos, sin centavos.
 * Los artesanales no se cotizan en centavos y "$ 40.000" se lee mejor que
 * "$ 40.000,00".
 */
const money = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatPrice(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  return money.format(Number.isFinite(n) ? n : 0)
}

const dateShort = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const dateLong = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return ''
  return dateShort.format(new Date(value))
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return ''
  return dateLong.format(new Date(value))
}

/** "hace 3 días" — para el centro de notificaciones. */
export function formatRelative(value: string | Date): string {
  const date = new Date(value)
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
  ]

  const rtf = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' })
  let amount = seconds
  for (const [unit, step] of units) {
    if (Math.abs(amount) < step) return rtf.format(-Math.round(amount), unit)
    amount /= step
  }
  return rtf.format(-Math.round(amount), 'year')
}

/** Slug para URLs: "Respaldo Sol 1,50" -> "respaldo-sol-1-50" */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

/**
 * Enlace de WhatsApp con el mensaje ya armado.
 * WhatsApp es el canal de conversación; los datos viven en Alma Tejida.
 */
export function whatsappLink(phone: string | null | undefined, message: string) {
  if (!phone) return null
  const clean = phone.replace(/\D/g, '')
  if (!clean) return null
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
}

/** Porcentaje entero de descuento, o null si no hay. */
export function discountPercent(list: number | null, final: number | null): number | null {
  if (!list || !final || final >= list) return null
  return Math.round(((list - final) / list) * 100)
}

/** "Nuevo" si se publico en los últimos 30 días (punto 111). */
export function isNew(publishedAt: string | null | undefined, days = 30): boolean {
  if (!publishedAt) return false
  const ms = Date.now() - new Date(publishedAt).getTime()
  return ms < days * 24 * 60 * 60 * 1000
}

export function pluralize(count: number, one: string, many: string) {
  return count === 1 ? one : many
}
