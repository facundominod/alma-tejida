'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/env'

/**
 * Autenticación.
 *
 * El rol NUNCA se toca desde acá. Un usuario nuevo es siempre `customer`:
 * lo fuerza el trigger handle_new_user() en la base, sin excepciones
 * (punto 156). No existe camino desde el registro publico al rol admin.
 */

export type AuthResult = { ok: true; message?: string } | { ok: false; error: string }

const emailSchema = z.string().trim().toLowerCase().email('Revisá el correo.')
const passwordSchema = z
  .string()
  .min(8, 'La contraseña tiene que tener al menos 8 caracteres.')
  .max(72, 'La contraseña es demasiado larga.')

export async function signIn(formData: FormData): Promise<AuthResult> {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, 'Escribí tu contraseña.') })
    .safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá los datos.' }
  }

  const supabase = await createClient()

  // Límite antifuerza bruta: 5 intentos cada 15 minutos por correo.
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `login:${parsed.data.email}`,
    p_max: 5,
    p_window_seconds: 900,
  })

  if (allowed === false) {
    return {
      ok: false,
      error: 'Demasiados intentos. Espera unos minutos antes de volver a probar.',
    }
  }

  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    // Mismo mensaje para usuario inexistente y contraseña incorrecta: decir
    // cual de los dos fallo confirmaria que ese correo tiene cuenta.
    return { ok: false, error: 'El correo o la contraseña no coinciden.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function signUp(formData: FormData): Promise<AuthResult> {
  const parsed = z
    .object({
      email: emailSchema,
      password: passwordSchema,
      fullName: z.string().trim().min(2, 'Necesitamos tu nombre.').max(120),
      phone: z.string().trim().max(40).optional(),
      acceptsMarketing: z.boolean().optional(),
    })
    .safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
      fullName: formData.get('fullName'),
      phone: formData.get('phone') || undefined,
      acceptsMarketing: formData.get('acceptsMarketing') === 'on',
    })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá los datos.' }
  }

  const supabase = await createClient()

  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `signup:${parsed.data.email}`,
    p_max: 3,
    p_window_seconds: 3600,
  })

  if (allowed === false) {
    return { ok: false, error: 'Demasiados intentos. Probá de nuevo en un rato.' }
  }

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirmar`,
      // Estos metadatos los lee handle_new_user() para armar el profile.
      // El rol NO viaja acá: lo fija la base.
      data: {
        full_name: parsed.data.fullName,
        phone: parsed.data.phone ?? '',
      },
    },
  })

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return {
        ok: false,
        error: 'Ya existe una cuenta con ese correo. Probá iniciar sesión.',
      }
    }
    return { ok: false, error: 'No pudimos crear la cuenta. Intentá de nuevo.' }
  }

  // Si hay consentimiento explicito, se guarda. Por defecto es false.
  if (parsed.data.acceptsMarketing) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('profiles')
        .update({ accepts_marketing: true })
        .eq('id', user.id)
    }
  }

  revalidatePath('/', 'layout')
  return {
    ok: true,
    message: 'Te mandamos un correo para confirmar tu cuenta.',
  }
}

export async function sendMagicLink(formData: FormData): Promise<AuthResult> {
  const parsed = emailSchema.safeParse(formData.get('email'))
  if (!parsed.success) return { ok: false, error: 'Revisá el correo.' }

  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `magic:${parsed.data}`,
    p_max: 3,
    p_window_seconds: 900,
  })

  if (allowed === false) {
    return { ok: false, error: 'Ya te enviamos un enlace. Revisá tu correo.' }
  }

  await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${siteUrl}/auth/confirmar` },
  })

  // Respuesta identica exista o no la cuenta: no se confirma quien esta
  // registrado.
  return {
    ok: true,
    message: 'Si ese correo tiene cuenta, te mandamos un enlace para entrar.',
  }
}

export async function requestPasswordReset(formData: FormData): Promise<AuthResult> {
  const parsed = emailSchema.safeParse(formData.get('email'))
  if (!parsed.success) return { ok: false, error: 'Revisá el correo.' }

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl}/auth/nueva-contrasena`,
  })

  return {
    ok: true,
    message: 'Si ese correo tiene cuenta, te mandamos las instrucciones.',
  }
}

export async function updatePassword(formData: FormData): Promise<AuthResult> {
  const parsed = passwordSchema.safeParse(formData.get('password'))
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá la contraseña.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data })

  if (error) return { ok: false, error: 'No pudimos actualizar la contraseña.' }

  revalidatePath('/', 'layout')
  return { ok: true, message: 'Listo, tu contraseña quedo actualizada.' }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Necesitamos tu nombre.').max(120),
  phone: z.string().trim().max(40).optional(),
  acceptsMarketing: z.boolean().optional(),
})

export async function updateProfile(formData: FormData): Promise<AuthResult> {
  const parsed = profileSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone') || undefined,
    acceptsMarketing: formData.get('acceptsMarketing') === 'on',
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá los datos.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Necesitás iniciar sesión.' }

  // La policy de UPDATE impide cambiar el rol aunque se intente: el WITH
  // CHECK compara el rol entrante con el guardado.
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      accepts_marketing: parsed.data.acceptsMarketing ?? false,
    })
    .eq('id', user.id)

  if (error) return { ok: false, error: 'No pudimos guardar los cambios.' }

  revalidatePath('/cuenta')
  return { ok: true, message: 'Datos actualizados.' }
}
