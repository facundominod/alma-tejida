import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, type Db } from './harness'

/**
 * Nombre de usuario (migración 0015).
 *
 * Lo que hay que demostrar acá no es que funcione —eso se ve usándolo— sino
 * que NO filtra. Un nombre de usuario que cualquiera puede traducir a un
 * correo es peor que no tener nombre de usuario: le entrega a quien pregunte
 * la lista de correos de toda la clientela.
 */
describe('nombre de usuario', () => {
  let pg: Db

  beforeEach(async () => {
    pg = await createTestDb()
    await pg.asService()
  })

  afterEach(async () => {
    await pg?.close()
  })

  /** Alta igual a la del registro: el nombre viaja en los metadatos. */
  async function registrar(email: string, username: string | null) {
    await pg.asService()
    const fila = await pg.one<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
       values ($1, now(), jsonb_build_object('full_name', 'Prueba', 'username', $2::text))
       returning id`,
      [email, username],
    )
    return fila!.id
  }

  it('el perfil toma el nombre del registro, y el rol sigue siendo customer', async () => {
    await registrar('silvana@ejemplo.com', 'silvana')

    const perfil = await pg.one<{ username: string; role: string }>(
      `select username, role from public.profiles where lower(email) = 'silvana@ejemplo.com'`,
    )

    expect(perfil!.username).toBe('silvana')
    // El registro publico sigue sin poder elegir rol (punto 156).
    expect(perfil!.role).toBe('customer')
  })

  it('dos personas no pueden tener el mismo nombre, ni cambiando mayúsculas', async () => {
    await registrar('silvana@ejemplo.com', 'silvana')
    await expect(registrar('otra@ejemplo.com', 'SILVANA')).rejects.toThrow(
      /duplicate key|profiles_username_key/i,
    )
  })

  it('se guarda como lo escribieron, pero se compara en minúscula', async () => {
    await registrar('ana@ejemplo.com', 'AnaTeje')

    const perfil = await pg.one<{ username: string }>(
      `select username from public.profiles where lower(username) = 'anateje'`,
    )
    expect(perfil!.username).toBe('AnaTeje')
  })

  it('rechaza nombres que no empiezan con letra, que son cortos o que llevan arroba', async () => {
    // La arroba es lo que distingue un nombre de un correo al entrar. Si se
    // pudiera usar, un nombre con forma de correo haría que el servidor lo
    // tratara como correo y buscara en el lugar equivocado.
    for (const malo of ['1silvana', '_silvana', 'sil vana', 'silvana@casa', 'ab']) {
      await expect(
        registrar(`cuenta-${encodeURIComponent(malo)}@ejemplo.com`, malo),
        `"${malo}" tendria que rechazarse`,
      ).rejects.toThrow(/profiles_username_formato|violates check/i)
    }
  })

  it('las cuentas sin nombre de usuario siguen siendo válidas', async () => {
    // Las que existían antes de esta migración. El índice único es parcial
    // justamente para que dos nulos no choquen entre sí.
    await registrar('vieja1@ejemplo.com', null)
    await registrar('vieja2@ejemplo.com', null)

    const fila = await pg.one<{ n: number }>(
      `select count(*)::int as n from public.profiles where username is null`,
    )
    expect(fila!.n).toBe(2)
  })

  describe('traducir nombre a correo', () => {
    beforeEach(async () => {
      await registrar('silvana@ejemplo.com', 'silvana')
    })

    it('encuentra el correo sin importar las mayúsculas', async () => {
      const fila = await pg.one<{ email: string }>(
        `select public.email_for_username('SiLvAnA') as email`,
      )
      expect(fila!.email).toBe('silvana@ejemplo.com')
    })

    it('devuelve nulo para un nombre que no existe', async () => {
      const fila = await pg.one<{ email: string | null }>(
        `select public.email_for_username('nadie') as email`,
      )
      expect(fila!.email).toBeNull()
    })

    /**
     * LA PRUEBA QUE IMPORTA.
     *
     * Si `anon` pudiera ejecutar esto, cualquiera con la anon key —que viaja
     * al navegador de todo el mundo— juntaría los correos de la clientela
     * probando nombres. El nombre de usuario dejaría de proteger y pasaría a
     * exponer.
     */
    it('NI anon NI authenticated pueden traducir un nombre a un correo', async () => {
      await pg.asAnon()
      await expect(pg.query(`select public.email_for_username('silvana')`)).rejects.toThrow(
        /permission denied/i,
      )

      await pg.asUser(await registrar('curiosa@ejemplo.com', 'curiosa'))
      await expect(pg.query(`select public.email_for_username('silvana')`)).rejects.toThrow(
        /permission denied/i,
      )
    })

    it('tampoco pueden preguntar si un nombre está libre', async () => {
      // Un si/no repetido es una forma mas lenta de la misma enumeracion.
      await pg.asAnon()
      await expect(pg.query(`select public.username_disponible('silvana')`)).rejects.toThrow(
        /permission denied/i,
      )
    })
  })

  describe('nombres reservados', () => {
    it('"admin" y "soporte" no están disponibles aunque nadie los use', async () => {
      // Alguien registrado como "soporte" puede responder una pregunta en una
      // ficha de producto y parecer la tienda.
      for (const reservado of ['admin', 'soporte', 'almatejida', 'Alma']) {
        const fila = await pg.one<{ libre: boolean }>(
          `select public.username_disponible($1) as libre`,
          [reservado],
        )
        expect(fila!.libre, `"${reservado}" tendria que estar reservado`).toBe(false)
      }
    })

    it('un nombre cualquiera sí está disponible', async () => {
      const fila = await pg.one<{ libre: boolean }>(
        `select public.username_disponible('tejedora_del_sur') as libre`,
      )
      expect(fila!.libre).toBe(true)
    })

    it('un nombre ya tomado no está disponible', async () => {
      await registrar('silvana@ejemplo.com', 'silvana')
      const fila = await pg.one<{ libre: boolean }>(
        `select public.username_disponible('SILVANA') as libre`,
      )
      expect(fila!.libre).toBe(false)
    })

    it('la tabla de reservados no se lee desde el navegador', async () => {
      await pg.asAnon()
      await expect(pg.query('select * from public.reserved_usernames')).rejects.toThrow(
        /permission denied/i,
      )
    })
  })
})
