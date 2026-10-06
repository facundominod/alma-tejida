'use client'

import Link from 'next/link'
import * as React from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input } from '@/components/ui/field'
import { updateProfile, type AuthResult } from '@/lib/actions/auth'

/**
 * Datos del cliente (punto 115).
 *
 * Solo lo necesario: nombre, teléfono y consentimiento. El correo no se edita
 * acá porque cambiarlo es cambiar la identidad de la cuenta, y eso pasa por
 * verificación.
 *
 * Aunque alguien manipulara el formulario, la policy de UPDATE de `profiles`
 * impide cambiar el rol: compara el rol entrante con el guardado.
 */
export function ProfileForm({
  fullName,
  username,
  email,
  phone,
  acceptsMarketing,
}: {
  fullName: string
  username: string
  email: string
  phone: string
  acceptsMarketing: boolean
}) {
  const [state, setState] = React.useState<AuthResult | null>(null)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setState(await updateProfile(new FormData(event.currentTarget)))
    setPending(false)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nombre y apellido" required>
        {(props) => <Input {...props} name="fullName" defaultValue={fullName} />}
      </Field>

      {/* Los dos de abajo se muestran y no se editan. Cambiar cualquiera de
          los dos cambia la forma de entrar a la cuenta, y eso no puede
          resolverse con un campo de texto: necesita confirmar que la cuenta
          nueva sigue siendo la misma persona. */}
      {username && (
        <Field label="Usuario" hint="Con esto entrás.">
          {(props) => <Input {...props} value={username} disabled readOnly />}
        </Field>
      )}

      <Field
        label="Correo"
        hint="Para recuperar la cuenta si olvidás la contraseña. Para cambiarlo, escribinos."
      >
        {(props) => <Input {...props} value={email} disabled readOnly />}
      </Field>

      <Field label="Teléfono" hint="Lo usamos para coordinar por WhatsApp.">
        {(props) => (
          <Input {...props} name="phone" type="tel" inputMode="tel" defaultValue={phone} />
        )}
      </Field>

      <Checkbox
        name="acceptsMarketing"
        label="Quiero enterarme de las novedades"
        description="Podés darte de baja cuando quieras."
        defaultChecked={acceptsMarketing}
      />

      {state && !state.ok && <FormError>{state.error}</FormError>}
      {state?.ok && state.message && (
        <p
          role="status"
          className="rounded-lg border border-sage-500/25 bg-sage-100/70 px-3.5 py-2.5 text-sm font-medium text-sage-600"
        >
          <Check className="mr-1.5 inline size-4" />
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Guardar cambios
        </Button>
        <Button asChild variant="ghost">
          <Link href="/recuperar">Cambiar contraseña</Link>
        </Button>
      </div>
    </form>
  )
}
