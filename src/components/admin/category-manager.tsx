'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Eye, EyeOff, FolderTree, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Ovillo } from '@/components/ui/ovillo'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/field'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { deleteCategory, saveCategory } from '@/lib/actions/admin/catalog'
import type { Category } from '@/types/database'

/**
 * Categorías (puntos 27-29).
 *
 * Se crean desde acá, nunca en el código. La estructura admite subcategorias
 * (parent_id), pero la interfaz solo las ofrece cuando ya hay al menos una
 * categoría: no tiene sentido pedir un padre cuando no hay ninguno.
 */
export function CategoryManager({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<Category | 'new' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState<string | null>(null)

  const roots = categories.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id)

  async function toggleVisible(category: Category) {
    setPending(category.id)
    setError(null)

    const result = await saveCategory({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description ?? undefined,
      parentId: category.parent_id,
      position: category.position,
      isVisible: !category.is_visible,
    })

    setPending(null)
    if (!result.ok) setError(result.error)
    else router.refresh()
  }

  async function remove(category: Category) {
    setPending(category.id)
    setError(null)

    const result = await deleteCategory(category.id)

    setPending(null)
    if (!result.ok) setError(result.error)
    else router.refresh()
  }

  return (
    <div className="space-y-4">
      <AltaRapida
        alCrear={() => router.refresh()}
        alPedirMas={() => setEditing('new')}
      />

      <FormError>{error}</FormError>

      {editing && (
        <CategoryForm
          category={editing === 'new' ? undefined : editing}
          categories={categories}
          onDone={() => {
            setEditing(null)
            router.refresh()
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {categories.length === 0 && !editing ? (
        <EmptyState
          icon={<FolderTree className="size-10" strokeWidth={1.3} />}
          title="Todavía no hay categorías"
          description="Respaldos, espejos, tapices... las que vos quieras. Se crean acá, no en el código."
          action={<Button onClick={() => setEditing('new')}>Crear la primera</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {roots.map((category) => (
            <li key={category.id}>
              <CategoryRow
                category={category}
                pending={pending === category.id}
                onEdit={() => setEditing(category)}
                onToggle={() => toggleVisible(category)}
                onDelete={() => remove(category)}
              />

              {childrenOf(category.id).length > 0 && (
                <ul className="ml-6 mt-2 space-y-2 border-l border-border-soft pl-4">
                  {childrenOf(category.id).map((child) => (
                    <li key={child.id}>
                      <CategoryRow
                        category={child}
                        pending={pending === child.id}
                        onEdit={() => setEditing(child)}
                        onToggle={() => toggleVisible(child)}
                        onDelete={() => remove(child)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Crear una categoría escribiendo el nombre y nada más.
 *
 * El formulario completo pide nombre, dirección, reseña, categoría madre,
 * posición y visibilidad. Está bien que exista —todo eso se edita— pero para
 * CREAR es demasiado: seis campos para decir "Espejos". Y era la única puerta.
 *
 * Acá alcanza el nombre. La dirección sale del nombre, la posición va al final
 * y nace visible. Lo demás se completa después, y la fila de la lista avisa si
 * le falta la reseña.
 */
function AltaRapida({
  alCrear,
  alPedirMas,
}: {
  alCrear: () => void
  alPedirMas: () => void
}) {
  const [nombre, setNombre] = React.useState('')
  const [pendiente, setPendiente] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function crear() {
    const limpio = nombre.trim()
    if (!limpio || pendiente) return

    setPendiente(true)
    setError(null)

    const result = await saveCategory({ name: limpio, isVisible: true })

    setPendiente(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setNombre('')
    alCrear()
  }

  return (
    <div className="space-y-2 rounded-xl border border-border-soft bg-surface p-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field label="Categoría nueva" hint="Alcanza el nombre. El resto se edita después.">
            {(props) => (
              <Input
                {...props}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                // Enter crea: es lo que uno hace sin pensarlo después de
                // escribir el nombre, y tener que buscar el botón con el mouse
                // es lo que hace que cargar cinco categorías cueste.
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void crear()
                  }
                }}
                placeholder="Espejos"
                maxLength={80}
              />
            )}
          </Field>
        </div>

        <Button onClick={crear} disabled={pendiente || !nombre.trim()}>
          {pendiente ? <Ovillo /> : <Plus />}
          Agregar
        </Button>
      </div>

      {error && <FormError>{error}</FormError>}

      <button
        type="button"
        onClick={alPedirMas}
        className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
      >
        Cargar una con reseña, foto y orden desde el principio
      </button>
    </div>
  )
}

function CategoryRow({
  category,
  pending,
  onEdit,
  onToggle,
  onDelete,
}: {
  category: Category
  pending: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = React.useState(false)

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-soft bg-surface p-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-ink">{category.name}</p>
          {!category.is_visible && (
            <Badge tone="neutral" size="sm">
              Oculta
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-ink-subtle">/categoria/{category.slug}</p>
        {/* La reseña es lo que se lee al entrar a la categoría. Sin ella la
            página abre directo en las piezas, sin presentación, y no hay forma
            de notarlo sin visitarla. */}
        {!category.intro?.trim() && (
          <button
            type="button"
            onClick={onEdit}
            className="mt-1 text-xs text-warning underline-offset-2 hover:underline"
          >
            Sin reseña — escribí la presentación de esta categoría
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onToggle}
          disabled={pending}
          aria-label={category.is_visible ? 'Ocultar categoría' : 'Mostrar categoría'}
        >
          {pending ? (
            <Ovillo />
          ) : category.is_visible ? (
            <Eye />
          ) : (
            <EyeOff />
          )}
        </Button>

        <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="Editar categoría">
          <Pencil />
        </Button>

        {confirming ? (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="danger" onClick={onDelete} disabled={pending}>
              Borrar
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              aria-label="Cancelar"
            >
              <X />
            </Button>
          </div>
        ) : (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setConfirming(true)}
            aria-label="Borrar categoría"
            className="text-ink-subtle hover:text-danger"
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  )
}

function CategoryForm({
  category,
  categories,
  onDone,
  onCancel,
}: {
  category?: Category
  categories: Category[]
  onDone: () => void
  onCancel: () => void
}) {
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Una categoría no puede ser su propia madre, ni la de sus hijas
  const possibleParents = categories.filter(
    (c) => c.id !== category?.id && c.parent_id !== category?.id,
  )

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const result = await saveCategory({
      id: category?.id,
      name: String(form.get('name') ?? ''),
      slug: String(form.get('slug') ?? '') || undefined,
      description: String(form.get('description') ?? ''),
      intro: String(form.get('intro') ?? ''),
      parentId: String(form.get('parentId') ?? '') || null,
      position: Number(form.get('position') ?? 0),
      isVisible: form.get('isVisible') === 'on',
    })

    setPending(false)
    if (!result.ok) setError(result.error)
    else onDone()
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-clay-200 bg-clay-50/50 p-4"
    >
      <h2 className="font-display text-lg">
        {category ? `Editar ${category.name}` : 'Nueva categoría'}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" required>
          {(props) => (
            <Input {...props} name="name" defaultValue={category?.name} maxLength={80} />
          )}
        </Field>

        <Field label="Dirección web" hint="Si lo dejas vacío, se arma con el nombre.">
          {(props) => (
            <Input
              {...props}
              name="slug"
              defaultValue={category?.slug}
              placeholder="respaldos"
              maxLength={80}
            />
          )}
        </Field>
      </div>

      {/* DOS TEXTOS, NO UNO.
          La reseña es lo que lee una persona al entrar; la descripción es lo
          que lee Google. Antes era el mismo campo, y escribir bien una
          arruinaba la otra: una presentación de cuatro frases es una
          descripción malísima para un buscador. */}
      <Field
        label="Reseña de la categoría"
        hint="Lo que se lee al entrar, arriba de las piezas. Contá de qué están hechas, qué medidas hay y por qué vale la pena quedarse mirando."
      >
        {(props) => (
          <Textarea
            {...props}
            name="intro"
            defaultValue={category?.intro ?? ''}
            rows={5}
            maxLength={2000}
            placeholder="Hilo kraft y algodón anudados a mano sobre un bastidor de madera…"
          />
        )}
      </Field>

      <Field
        label="Descripción corta"
        hint="Para Google y para cuando se comparte el enlace. Una línea."
      >
        {(props) => (
          <Textarea
            {...props}
            name="description"
            defaultValue={category?.description ?? ''}
            rows={2}
            maxLength={500}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {possibleParents.length > 0 && (
          <Field label="Dentro de" hint="Opcional. Para armar subcategorias.">
            {(props) => (
              <Select {...props} name="parentId" defaultValue={category?.parent_id ?? ''}>
                <option value="">Categoría principal</option>
                {possibleParents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field label="Orden" hint="Menor número, más arriba.">
          {(props) => (
            <Input
              {...props}
              name="position"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={category?.position ?? 0}
              className="tabular w-28"
            />
          )}
        </Field>
      </div>

      <Checkbox
        name="isVisible"
        label="Visible en la tienda"
        defaultChecked={category?.is_visible ?? true}
      />

      <FormError>{error}</FormError>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Ovillo />}
          Guardar
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
