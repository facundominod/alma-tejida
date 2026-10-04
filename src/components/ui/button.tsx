import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Botón de Alma Tejida.
 *
 * Objetivo táctil mínimo de 44px en las medidas `md` y `lg` (accesibilidad).
 * Solo se animan transform, opacity y color: nada que obligue a recalcular
 * layout.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium select-none',
    'transition-[background-color,color,border-color,transform,opacity]',
    'duration-[var(--at-dur-fast)] ease-[var(--ease-out-alma)]',
    'active:scale-[0.98]',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-on-primary shadow-soft hover:bg-primary-hover',
        secondary:
          'bg-surface text-ink border border-border-strong hover:bg-surface-muted',
        soft: 'bg-primary-soft text-clay-700 hover:bg-clay-200',
        ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
        link: 'text-primary underline-offset-4 hover:underline p-0 h-auto',
        danger: 'bg-danger text-white hover:bg-danger/90',
        whatsapp:
          'bg-sage-500 text-white hover:bg-sage-600 shadow-soft',
      },
      size: {
        sm: 'h-9 rounded-md px-3 text-sm [&_svg]:size-4',
        md: 'h-11 rounded-lg px-5 text-[0.9375rem] [&_svg]:size-[18px]',
        lg: 'h-13 rounded-lg px-7 text-base [&_svg]:size-5',
        icon: 'size-11 rounded-lg [&_svg]:size-5',
        'icon-sm': 'size-9 rounded-md [&_svg]:size-4',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

export function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      // Un <button> dentro de un formulario envia por defecto. Explicitarlo
      // evita envíos accidentales en botones que solo abren un panel.
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  )
}

export { buttonVariants }
