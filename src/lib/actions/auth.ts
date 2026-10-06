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

/**
 * Un solo mensaje para los cuatro fracasos posibles al entrar: el nombre no
 * existe, el correo no existe, el formato era inválido, la contraseña no era.
 * Distinguirlos le diría a cualquiera qué cuentas existen, probando nombres.
 */
const NO_COINCIDEN = 'El usuario o la contraseña no coinciden.'

const emailSchema = z.string().trim().toLowerCase().email('Revisá el correo.')
const passwordSchema = z
  .string()
  .min(8, 'La contraseña tiene que tener al menos 8 caracteres.')
  .max(72, 'La contraseña es demasiado larga.')

/**
 * Nombre de usuario.
 *
 * Empieza con letra y no lleva arroba: eso es lo que permite saber, al
 * entrar, si lo que escribieron es un nombre o un correo sin tener que
 * preguntarlo. El espejo de este formato está en la migración 0015.
 */
const usernameSchema = z
  .string()
  .trim()
  .min(3, 'El nombre de usuario necesita al menos 3 letras.')
  .max(24, 'El nombre de usuario es demasiado largo.')
  .regex(
    /^[A-Za-z][A-Za-z0-9._-]*$/,
    'Empezá con una letra. Después, letras, números, punto, guion o guion bajo.',
  )

const esCorreo = (valor: string) => valor.includes('@')

/**
 * Traduce lo que la persona escribió a un correo, que es lo único con lo que
 * Supabase sabe trabajar.
 *
 * La traducción ocurre SIEMPRE en el servidor. Si el navegador pudiera
 * preguntar "¿qué correo tiene silvana?", el nombre de usuario dejaría de
 * proteger nada: bastaría con probar nombres para juntar los correos de toda
 * la clientela. Por eso `email_for_username` sólo la puede ejecutar
 * `service_role` (ver migración 0015).
 *
 * Devuelve null cuando no hay a quién: quien llama tiene que contestar lo
 * mismo que contestaría ante una contraseña equivocada.
 */
async function resolverCorreo(identificador: string): Promise<string | null> {
  const limpio = identificador.trim()

  if (esCorreo(limpio)) {
    const correo = emailSchema.safeParse(limpio)
    return correo.success ? correo.data : null
  }

  // Un nombre con formato inválido no puede existir: no hace falta preguntar.
  if (!usernameSchema.safeParse(limpio).success) return null

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data, error } = await createAdminClient().rpc('email_for_username', {
    p_username: limpio,
  })

  return error || !data ? null : data
}

export async function signIn(formData: FormData): Promise<AuthResult> {
  const parsed = z
    .object({
      identificador: z.string().trim().min(1, 'Escribí tu usuario o tu correo.'),
      password: z.string().min(1, 'Escribí tu contraseña.'),
    })
    .safeParse({
      identificador: formData.get('identificador'),
      password: formData.get('password'),
    })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá los datos.' }
  }

  const supabase = await createClient()

  // Límite antifuerza bruta: 5 intentos cada 15 minutos.
  //
  // La cuenta se cuenta por lo que la persona escribió, en minúscula. Si se
  // contara por el correo resuelto, probar mil nombres de usuario distintos
  // no gastaría ni un intento.
  const clave = parsed.data.identificador.toLowerCase()
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `login:${clave}`,
    p_max: 5,
    p_window_seconds: 900,
  })

  if (allowed === false) {
    return {
      ok: false,
      error: 'Demasiados intentos. Espera unos minutos antes de volver a probar.',
    }
  }

  const email = await resolverCorreo(parsed.data.identificador)
  if (!email) return { ok: false, error: NO_COINCIDEN }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  })

  if (error) {
    return { ok: false, error: NO_COINCIDEN }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function signUp(formData: FormData): Promise<AuthResult> {
  const parsed = z
    .object({
      username: usernameSchema,
      email: emailSchema,
      password: passwordSchema,
      fullName: z.string().trim().min(2, 'Necesitamos tu nombre.').max(120),
      phone: z.string().trim().max(40).optional(),
      acceptsMarketing: z.boolean().optional(),
    })
    .safeParse({
      username: formData.get('username'),
      email: formData.get('email'),
      password: formData.get('password'),
      fullName: formData.get('fullName'),
      phone: formData.get('phone') || undefined,
      acceptsMarketing: formData.get('acceptsMarketing') === 'on',
    })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá los datos.' }
  }

  // Se avisa antes de crear nada. El índice único de la base es el que manda
  // —dos registros simultáneos con el mismo nombre no pueden pasar los dos—
  // pero descubrirlo recién al final sería decirle a alguien que su cuenta no
  // se creó después de haber completado todo el formulario.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data: libre } = await createAdminClient().rpc('username_disponible', {
    p_username: parsed.data.username,
  })

  if (libre === false) {
    return { ok: false, error: 'Ese nombre de usuario ya está tomado. Probá con otro.' }
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
        username: parsed.data.username,
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
  const identificador = String(formData.get('identificador') ?? '').trim()
  if (!identificador) return { ok: false, error: 'Escribí tu usuario o tu correo.' }

  const supabase = await createClient()

  // El límite se cuenta por lo escrito, antes de resolver nada: si se contara
  // por el correo final, probar nombres de usuario sería gratis.
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `magic:${identificador.toLowerCase()}`,
    p_max: 3,
    p_window_seconds: 900,
  })

  if (allowed === false) {
    return { ok: false, error: 'Ya te enviamos un enlace. Revisá tu correo.' }
  }

  // El enlace viaja por correo, así que si escribieron un nombre de usuario
  // hay que averiguar a dónde mandarlo. Nunca se dice cuál es.
  const email = await resolverCorreo(identificador)

  if (email) {
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteUrl}/auth/confirmar` },
    })
  }

  // Respuesta identica exista o no la cuenta: no se confirma quien esta
  // registrado. Por eso el envio va adentro de un if y el mensaje, afuera.
  return {
    ok: true,
    message: 'Si esa cuenta existe, te mandamos un enlace para entrar.',
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
