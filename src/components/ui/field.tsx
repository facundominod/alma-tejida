'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Campos de formulario accesibles.
 *
 * Cada campo tiene <label> real asociado por id, los errores se anuncian con
 * aria-live y el control queda marcado con aria-invalid. Nada de placeholders
 * haciendo de etiqueta: desaparecen al escribir y dejan a la persona sin saber
 * que estaba completando.
 */

const inputBase = [
  'w-full rounded-lg border bg-surface px-3.5 text-ink',
  'placeholder:text-linen-400',
  'transition-[border-color,box-shadow] duration-[var(--at-dur-fast)]',
  'hover:border-border-strong',
  'focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-clay-500/25',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20',
].join(' ')

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  id: providedId,
}: {
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  children: (props: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
    required?: boolean
  }) => React.ReactNode
  className?: string
  id?: string
}) {
  const generatedId = React.useId()
  const id = providedId ?? generatedId
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required,
      })}

      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(inputBase, 'h-11', className)} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(inputBase, 'min-h-24 py-2.5', className)} {...props} />
}

export function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select className={cn(inputBase, 'h-11 pr-8', className)} {...props}>
      {children}
    </select>
  )
}

/** Casilla con área táctil generosa: toda la fila es clickeable. */
export function Checkbox({
  label,
  description,
  className,
  ...props
}: React.ComponentProps<'input'> & { label: string; description?: string }) {
  const id = React.useId()
  return (
    <div className={cn('flex gap-3', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-border-strong text-primary accent-[var(--color-primary)] focus-visible:ring-[3px] focus-visible:ring-clay-500/25"
        {...props}
      />
      <label htmlFor={id} className="cursor-pointer select-none text-sm leading-snug">
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="block text-ink-subtle">{description}</span>}
      </label>
    </div>
  )
}

/**
 * Mensaje de error de formulario completo.
 * role="alert" para que el lector de pantalla lo anuncie sin que haya que
 * buscarlo.
 */
export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return (
    <p
      role="alert"
      className="rounded-lg border border-danger/25 bg-[color-mix(in_srgb,var(--color-danger)_7%,white)] px-3.5 py-2.5 text-sm font-medium text-danger"
    >
      {children}
    </p>
  )
}
