'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input } from '@/components/ui/field'
import {
  requestPasswordReset,
  sendMagicLink,
  signIn,
  signUp,
  updatePassword,
  type AuthResult,
} from '@/lib/actions/auth'
import { mergeCartOnLogin } from '@/lib/actions/order'
import { useCart } from '@/lib/cart/cart-store'

/** Envoltorio comun: caja, título, estado de envío y mensajes. */
function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="space-y-5 rounded-xl border border-border-soft bg-surface p-6 shadow-card">
      <div className="space-y-1">
        <h1 className="font-display text-2xl text-linen-900">{title}</h1>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {children}
      {footer && <div className="border-t border-border-soft pt-4 text-sm">{footer}</div>}
    </div>
  )
}

function Success({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-lg border border-sage-500/25 bg-sage-100/70 px-3.5 py-2.5 text-sm font-medium text-sage-600"
    >
      {children}
    </p>
  )
}

/* =============================================================================
   INGRESAR
   ========================================================================== */
export function SignInForm() {
  const router = useRouter()
  const params = useSearchParams()
  const cart = useCart()
  const [state, setState] = React.useState<AuthResult | null>(null)
  const [pending, setPending] = React.useState(false)
  const [magic, setMagic] = React.useState(false)

  const returnTo = params.get('volver') ?? '/cuenta'

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setState(null)

    const formData = new FormData(event.currentTarget)
    const result = magic ? await sendMagicLink(formData) : await signIn(formData)

    setState(result)
    setPending(false)

    if (result.ok && !magic) {
      // El carrito del visitante se fusiona con el de la cuenta, y los
      // pedidos hechos como invitado con este correo se vinculan (punto 71).
      if (cart.lines.length > 0) {
        await mergeCartOnLogin(
          cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        )
      }
      router.push(returnTo)
      router.refresh()
    }
  }

  return (
    <AuthCard
      title="Ingresar"
      description={
        magic
          ? 'Te mandamos un enlace para entrar sin contraseña.'
          : 'Para ver tus pedidos, preguntas y reseñas.'
      }
      footer={
        <p className="text-ink-muted">
          ¿Todavía no tenés cuenta?{' '}
          <Link href="/crear-cuenta" className="font-medium text-clay-700 hover:underline">
            Crear cuenta
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Usuario o correo" required>
          {(props) => (
            <Input
              {...props}
              name="identificador"
              // `type="text"`, no `type="email"`: con email el navegador
              // marcaría "silvana" como inválido y no dejaría enviar.
              type="text"
              autoComplete="username"
              placeholder="silvana  ·  tunombre@correo.com"
            />
          )}
        </Field>

        {!magic && (
          <Field label="Contraseña" required>
            {(props) => (
              <Input
                {...props}
                name="password"
                type="password"
                autoComplete="current-password"
              />
            )}
          </Field>
        )}

        {state && !state.ok && <FormError>{state.error}</FormError>}
        {state?.ok && state.message && <Success>{state.message}</Success>}

        <Button type="submit" size="lg" block disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {magic ? 'Enviarme el enlace' : 'Ingresar'}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setMagic((v) => !v)
              setState(null)
            }}
            className="inline-flex items-center gap-1.5 text-ink-muted hover:text-clay-700"
          >
            <Mail className="size-3.5" />
            {magic ? 'Usar contraseña' : 'Entrar sin contraseña'}
          </button>
          {!magic && (
            <Link href="/recuperar" className="text-ink-muted hover:text-clay-700">
              Olvidé mi contraseña
            </Link>
          )}
        </div>
      </form>
    </AuthCard>
  )
}

/* =============================================================================
   CREAR CUENTA
   ========================================================================== */
export function SignUpForm() {
  const [state, setState] = React.useState<AuthResult | null>(null)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setState(null)
    setState(await signUp(new FormData(event.currentTarget)))
    setPending(false)
  }

  if (state?.ok) {
    return (
      <AuthCard title="Revisá tu correo">
        <Success>{state.message}</Success>
        <p className="text-sm text-ink-muted">
          Si ya hiciste pedidos con ese mismo correo, van a aparecer en &ldquo;Mis
          pedidos&rdquo; apenas confirmes.
        </p>
        <Button asChild variant="secondary" block>
          <Link href="/ingresar">Ir a ingresar</Link>
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Crear cuenta"
      description="Para guardar tu carrito, seguir tus pedidos y poder preguntar."
      footer={
        <p className="text-ink-muted">
          ¿Ya tenés cuenta?{' '}
          <Link href="/ingresar" className="font-medium text-clay-700 hover:underline">
            Ingresar
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nombre y apellido" required>
          {(props) => <Input {...props} name="fullName" autoComplete="name" />}
        </Field>

        <Field
          label="Nombre de usuario"
          required
          hint="Con esto vas a entrar. Entre 3 y 24 caracteres, empezando con una letra."
        >
          {(props) => (
            <Input
              {...props}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="silvana"
            />
          )}
        </Field>

        <Field
          label="Correo"
          hint="Opcional. Si no ponés ninguno, nadie va a poder recuperar tu contraseña si la olvidás."
        >
          {(props) => (
            <Input
              {...props}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
            />
          )}
        </Field>

        <Field label="Teléfono" hint="Opcional. Sirve para coordinar por WhatsApp.">
          {(props) => (
            <Input {...props} name="phone" type="tel" inputMode="tel" autoComplete="tel" />
          )}
        </Field>

        <Field label="Contraseña" required hint="Al menos 8 caracteres.">
          {(props) => (
            <Input {...props} name="password" type="password" autoComplete="new-password" />
          )}
        </Field>

        <Checkbox
          name="acceptsMarketing"
          label="Quiero enterarme de las novedades"
          description="Solo cuando haya algo que valga la pena. Podés darte de baja cuando quieras."
        />

        {state && !state.ok && <FormError>{state.error}</FormError>}

        <Button type="submit" size="lg" block disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Crear cuenta
        </Button>
      </form>
    </AuthCard>
  )
}

/* =============================================================================
   RECUPERAR / NUEVA CONTRASENA
   ========================================================================== */
export function ResetRequestForm() {
  const [state, setState] = React.useState<AuthResult | null>(null)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setState(await requestPasswordReset(new FormData(event.currentTarget)))
    setPending(false)
  }

  return (
    <AuthCard
      title="Recuperar contraseña"
      description="Te mandamos un enlace para elegir una nueva."
      footer={
        <Link href="/ingresar" className="text-ink-muted hover:text-clay-700">
          Volver a ingresar
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Correo" required>
          {(props) => (
            <Input {...props} name="email" type="email" autoComplete="email" />
          )}
        </Field>

        {state && !state.ok && <FormError>{state.error}</FormError>}
        {state?.ok && state.message && <Success>{state.message}</Success>}

        <Button type="submit" size="lg" block disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Enviar instrucciones
        </Button>
      </form>
    </AuthCard>
  )
}

export function NewPasswordForm() {
  const router = useRouter()
  const [state, setState] = React.useState<AuthResult | null>(null)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const result = await updatePassword(new FormData(event.currentTarget))
    setState(result)
    setPending(false)
    if (result.ok) {
      window.setTimeout(() => router.push('/cuenta'), 1200)
    }
  }

  return (
    <AuthCard title="Nueva contraseña" description="Elegí una nueva para tu cuenta.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nueva contraseña" required hint="Al menos 8 caracteres.">
          {(props) => (
            <Input {...props} name="password" type="password" autoComplete="new-password" />
          )}
        </Field>

        {state && !state.ok && <FormError>{state.error}</FormError>}
        {state?.ok && state.message && <Success>{state.message}</Success>}

        <Button type="submit" size="lg" block disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Guardar contraseña
        </Button>
      </form>
    </AuthCard>
  )
}
