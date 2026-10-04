'use client'

import * as React from 'react'
import { Check, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Copiar al portapapeles.
 *
 * Sin valor copia la URL actual (el enlace de seguimiento del pedido). El
 * estado "copiado" dura 2 segundos y se anuncia por aria-live, porque un
 * cambio de icono no le dice nada a quien usa lector de pantalla.
 */
export function CopyButton({
  value,
  label = 'Copiar enlace',
  icon,
  className,
}: {
  value?: string
  label?: string
  icon?: React.ReactNode
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    const text = value ?? (typeof window !== 'undefined' ? window.location.href : '')
    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Navegador sin permiso de portapapeles: el texto igual está a la vista
      // y se puede seleccionar a mano.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
          'text-clay-700 transition-colors hover:bg-clay-100',
          className,
        )}
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          (icon ?? <Link2 className="size-3.5" />)
        )}
        {copied ? 'Copiado' : label}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? 'Copiado al portapapeles' : ''}
      </span>
    </>
  )
}
