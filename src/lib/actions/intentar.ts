/**
 * Llamar a una acción del servidor sin que un error deje el botón colgado.
 *
 * EL PROBLEMA QUE RESUELVE, QUE ESTABA EN LOS DOCE FORMULARIOS DEL PANEL
 *
 * Las acciones devuelven `{ ok: false, error }` cuando algo sale mal, y los
 * formularios lo muestran. Pero algunas no DEVUELVEN el error: lo LANZAN.
 * `requireAdmin()` lanza por diseño cuando la sesión venció, que es
 * exactamente lo correcto de su parte.
 *
 * Y el llamado estaba escrito así:
 *
 *     const result = await saveProduct({ ... })
 *     setSaving(false)
 *
 * Si la acción lanza, la promesa se rechaza, `setSaving(false)` nunca corre y
 * el botón se queda en "Guardando..." para siempre, sin un solo mensaje. Desde
 * el otro lado se ve como "no me deja guardar": no falla, no avisa, no pasa
 * nada.
 *
 * POR QUÉ UN ENVOLTORIO Y NO UN `try` EN CADA LUGAR
 * Porque son veintitrés llamados en doce archivos, y el que se agregue mañana
 * va a volver a olvidarse. Acá el caso está resuelto una vez.
 *
 * LA SESIÓN VENCIDA TIENE SU PROPIO MENSAJE
 * Es de lejos la causa más común —el panel se usa a lo largo del día— y la
 * única que la persona puede resolver sola. "No pudimos guardar" la deja
 * mirando la pantalla; "se cerró tu sesión, volvé a entrar" la deja entrando.
 */

export type Fallo = { ok: false; error: string }

export async function intentar<T extends { ok: boolean }>(
  accion: () => Promise<T>,
): Promise<T | Fallo> {
  try {
    return await accion()
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)

    if (mensaje.includes('FORBIDDEN')) {
      return {
        ok: false,
        error: 'Se cerró tu sesión. Volvé a entrar y probá de nuevo.',
      }
    }

    // El texto crudo va adelante: estas pantallas las ve sólo la
    // administradora, y un mensaje genérico obliga a adivinar.
    return {
      ok: false,
      error: `No se pudo completar. ${mensaje}`.trim(),
    }
  }
}
