import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Los bloques plegables del final de la ficha.
 *
 * EL PROBLEMA
 * Debajo de la compra venían, una abajo de la otra y siempre abiertas: la
 * descripción, la lista de precios, la tabla de medidas, las preguntas y las
 * reseñas. Cinco secciones completas. Para llegar a "piezas relacionadas"
 * había que pasar media docena de pantallas, y quien ya decidió comprar
 * scrollea todo eso sin leer nada.
 *
 * Plegados, la ficha entra en una pantalla y media. Lo que alguien busca lo
 * abre; lo que no, no le cuesta nada.
 *
 * POR QUÉ `<details>` Y NO UN ACORDEÓN DE REACT
 * Porque funciona sin JavaScript, lo abre el teclado solo, los lectores de
 * pantalla ya saben qué es, y el buscador de la página (ctrl+F del navegador)
 * encuentra el texto adentro. Un acordeón hecho a mano cuesta todo eso y no
 * agrega nada.
 *
 * Y porque el contenido sigue EN EL HTML aunque esté plegado: Google lo lee
 * igual. Un acordeón que monta el contenido al abrirlo deja la descripción de
 * la pieza fuera del índice.
 */
export function BloqueDeLaFicha({
  titulo,
  resumen,
  abierto = false,
  id,
  children,
}: {
  titulo: string
  /** Lo que se ve sin abrir: cuántas preguntas hay, cuántas reseñas. */
  resumen?: string
  abierto?: boolean
  id?: string
  children: React.ReactNode
}) {
  return (
    <details
      id={id}
      open={abierto}
      className="group border-b border-border-soft py-1 [&[open]_.at-flecha]:rotate-180"
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-4 py-4',
          'rounded-lg transition-colors hover:text-clay-700',
          // Safari sigue dibujando el triángulo sin esto.
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <span className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="font-display text-lg text-linen-900">{titulo}</span>
          {resumen && <span className="text-sm text-ink-subtle">{resumen}</span>}
        </span>
        <ChevronDown
          className="at-flecha size-5 shrink-0 text-ink-subtle transition-transform duration-[var(--at-dur-base)]"
          aria-hidden="true"
        />
      </summary>

      <div className="pb-6">{children}</div>
    </details>
  )
}
