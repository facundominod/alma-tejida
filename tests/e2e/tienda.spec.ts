import { test, expect, type Page } from '@playwright/test'
import { COPY } from '../../src/lib/labels'

/**
 * La tienda, en un navegador de verdad.
 *
 * Estas pruebas NO necesitan base de datos: verifican la cáscara, la
 * navegación, los estados vacíos, el carrito y la accesibilidad. Corren en los
 * seis tamaños del punto 204.
 *
 * Los textos se importan de `COPY` en lugar de copiarse. Cuando se reescribió
 * el tono de la tienda, estas pruebas seguían buscando las frases viejas: no
 * fallaban por un error real, fallaban por estar desactualizadas, que es la
 * peor clase de prueba. Ahora verifican que el mensaje que envía la aplicación
 * es el que la persona ve, sin importar cómo esté redactado.
 */

const esMovil = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

/**
 * Va al catálogo y espera a que TERMINE de llegar.
 *
 * `/tienda` es dinámica y se envía en dos partes: primero el armazón con el
 * hilo que se dibuja (`loading.tsx`), después el contenido. `page.goto()`
 * vuelve con la primera, así que preguntar ahí por los productos mide el
 * momento equivocado: no hay artículos, pero tampoco está todavía el mensaje
 * de catálogo vacío.
 *
 * Corriendo de a una prueba no se nota; con seis navegadores a la vez contra
 * una base en Brasil, sí. Falló una sola vez, en tablet, y era esto.
 *
 * Se espera al RESULTADO, no a un indicio de él. El primer intento esperaba a
 * que desapareciera el indicador de carga, y era peor que inútil: si todavía
 * no empezó a llegar nada, tampoco está el indicador, así que la condición se
 * cumplía de inmediato y la prueba seguía midiendo una página vacía.
 *
 * El buscador sí sirve: vive dentro del contenido de la página y está siempre,
 * haya piezas o no. Si se ve, llegó todo.
 */
async function irAlCatalogo(page: Page) {
  await page.goto('/tienda')
  await expect(
    page.getByRole('searchbox', { name: /buscar en la tienda/i }),
  ).toBeVisible({ timeout: 20_000 })

  return contenidoDe(page)
}

/**
 * El contenido de la página, sin lo que Next deja tirado.
 *
 * Cuando una ruta llega por streaming, Next arma el contenido en un
 * `<div hidden>` al final del documento y después lo mueve a su lugar —pero
 * **no borra el div**. Queda una copia completa, invisible para cualquier
 * persona y perfectamente visible para `getByText`, que no filtra por
 * visibilidad. La prueba fallaba con "resolved to 2 elements" y pareció dos
 * veces una carrera que no era.
 *
 * `getByRole` no sufre esto porque el árbol de accesibilidad ignora lo que
 * está dentro de `[hidden]`; por eso la prueba del h1 nunca falló.
 *
 * `#contenido` es el destino del enlace "saltar al contenido": el lugar donde
 * está lo que la persona lee de verdad.
 */
function contenidoDe(page: Page) {
  return page.locator('#contenido')
}

test.describe('la tienda carga y se navega', () => {
  test('la portada muestra la marca, el título y el botón principal', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/Alma Tejida/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // El CTA tiene que estar, y tiene que llevar a la tienda
    const cta = page.getByRole('link', { name: /ver productos/i }).first()
    await expect(cta).toBeVisible()
    await cta.click()
    await expect(page).toHaveURL(/\/tienda/)
  })

  test('EL BOTÓN PRINCIPAL SE VE SIN SCROLLEAR (punto 125)', async ({ page }) => {
    await page.goto('/')

    const cta = page.getByRole('link', { name: /ver productos/i }).first()
    const caja = await cta.boundingBox()
    const alto = page.viewportSize()?.height ?? 0

    expect(caja).not.toBeNull()
    // El botón entero, no sólo su borde superior
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(alto)
  })

  test('no hay scroll horizontal en ninguna pantalla', async ({ page }) => {
    for (const ruta of ['/', '/tienda', '/ofertas', '/contacto', '/carrito']) {
      await page.goto(ruta)

      const desborda = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
      expect(desborda, `${ruta} desborda horizontalmente`).toBe(false)
    }
  })

  test('el catálogo vacío lo dice con claridad, sin hablar de filtros', async ({ page }) => {
    const contenido = await irAlCatalogo(page)

    const vacio = contenido.getByText(COPY.catalogComingSoon)
    const conProductos = contenido.locator('article').first()

    // Una de las dos: o hay piezas, o el mensaje correcto
    if ((await conProductos.count()) === 0) {
      await expect(vacio).toBeVisible()
      // El error que teníamos: hablar de un filtro que nadie aplicó
      await expect(contenido.getByText(COPY.emptyCatalog)).toHaveCount(0)
    }
  })

  test('la página 404 es de Alma Tejida y ofrece una salida', async ({ page }) => {
    const respuesta = await page.goto('/una-ruta-que-no-existe')

    expect(respuesta?.status()).toBe(404)
    await expect(page.getByText(COPY.notFound)).toBeVisible()
    await expect(page.getByRole('link', { name: COPY.notFoundAction })).toBeVisible()
  })

  test('el pie muestra la marca y los enlaces de la tienda', async ({ page }) => {
    await page.goto('/')
    const pie = page.locator('footer')

    await expect(pie).toBeVisible()
    await expect(pie.getByRole('link', { name: /todas las piezas/i })).toBeVisible()
  })
})

test.describe('navegación según el tamaño', () => {
  test('en celular hay barra inferior; en escritorio, no', async ({ page }) => {
    await page.goto('/')
    const barra = page.getByRole('navigation', { name: /navegación principal/i })

    if (esMovil(page)) {
      await expect(barra).toBeVisible()
      // Los cuatro destinos del punto 126
      for (const destino of ['Inicio', 'Tienda', 'Carrito', 'Cuenta']) {
        await expect(barra.getByRole('link', { name: destino })).toBeVisible()
      }
    } else {
      await expect(barra).toBeHidden()
    }
  })

  test('en celular el menú lateral abre y cierra', async ({ page }) => {
    test.skip(!esMovil(page), 'el menú lateral es sólo de celular')

    await page.goto('/')
    await page.getByRole('button', { name: /abrir menú/i }).click()

    const panel = page.getByRole('dialog', { name: /menú de navegación/i })
    await expect(panel).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
  })

  test('los objetivos táctiles de la barra inferior llegan a 44px', async ({ page }) => {
    test.skip(!esMovil(page), 'sólo aplica en celular')

    await page.goto('/')
    const enlaces = page.getByRole('navigation', { name: /navegación principal/i }).getByRole('link')

    for (const enlace of await enlaces.all()) {
      const caja = await enlace.boundingBox()
      expect(caja!.height).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('el carrito', () => {
  test('arranca vacío y lo dice sin frialdad', async ({ page }) => {
    await page.goto('/carrito')
    await expect(page.getByText(COPY.emptyCart)).toBeVisible()
    await expect(page.getByRole('link', { name: COPY.emptyCartAction })).toBeVisible()
  })

  test('SOBREVIVE A CERRAR EL NAVEGADOR (punto 72)', async ({ page, context }) => {
    await page.goto('/')

    // Se escribe un carrito como lo haría la tienda
    await page.evaluate(() => {
      window.localStorage.setItem(
        'alma-tejida:carrito:v1',
        JSON.stringify([
          {
            variantId: '00000000-0000-0000-0000-000000000001',
            productId: '00000000-0000-0000-0000-000000000002',
            slug: 'manta-de-prueba',
            name: 'Manta de prueba',
            variantLabel: 'Crudo',
            image: null,
            price: 40000,
            listPrice: null,
            quantity: 2,
            maxAvailable: 5,
            madeToOrder: false,
          },
        ]),
      )
    })

    // Una pestaña nueva del mismo navegador: es lo que pasa al volver
    const otra = await context.newPage()
    await otra.goto('/carrito')

    await expect(otra.getByText('Manta de prueba')).toBeVisible()

    // 2 unidades x $40.000. El importe aparece en la linea, en el subtotal y
    // en el total, asi que se busca el primero y no "el unico".
    await expect(otra.getByText(/\$\s?80\.000/).first()).toBeVisible()
    await otra.close()
  })

  test('un localStorage corrupto no rompe la tienda', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      window.localStorage.setItem('alma-tejida:carrito:v1', '{{{ esto no es json')
    })

    await page.goto('/carrito')
    // Degrada a carrito vacío, no a pantalla de error
    await expect(page.getByText(COPY.emptyCart)).toBeVisible()
  })
})

test.describe('zonas privadas', () => {
  test('el panel de administración no deja pasar a quien no inició sesión', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/ingresar/)
  })

  test('mi cuenta tampoco', async ({ page }) => {
    await page.goto('/cuenta/pedidos')
    await expect(page).toHaveURL(/\/ingresar/)
  })

  test('las zonas privadas piden no ser indexadas (punto 206)', async ({ request }) => {
    // Sin seguir la redireccion: lo que importa es la cabecera de ESA
    // respuesta, no la de /ingresar.
    const respuesta = await request.get('/admin', { maxRedirects: 0 })
    expect(respuesta.headers()['x-robots-tag'] ?? '').toMatch(/noindex/)
  })

  test('un pedido sin token no se puede mirar', async ({ page }) => {
    const respuesta = await page.goto('/pedido/AT-00001')
    expect(respuesta?.status()).toBe(404)
  })
})

test.describe('accesibilidad', () => {
  test('existe "saltar al contenido" y lleva al contenido', async ({ page }) => {
    await page.goto('/')

    // Se comprueba el DOM y no el orden de tabulacion, porque Safari no
    // tabula a los enlaces salvo que la persona active el acceso completo
    // por teclado. El enlace tiene que estar y tiene que funcionar.
    const salto = page.getByRole('link', { name: /saltar al contenido/i })
    await expect(salto).toHaveAttribute('href', '#contenido')

    // Y es el primer elemento interactivo del documento
    const esPrimero = await page.evaluate(() => {
      const interactivos = document.querySelectorAll('a[href], button, input, select, textarea')
      return interactivos[0]?.getAttribute('href') === '#contenido'
    })
    expect(esPrimero).toBe(true)

    await expect(page.locator('#contenido')).toBeAttached()
  })

  test('el foco siempre se ve', async ({ page }) => {
    await irAlCatalogo(page)

    const buscador = page.getByRole('searchbox', { name: /buscar en la tienda/i })
    await buscador.focus()

    const sinAnillo = await buscador.evaluate((el) => {
      const estilo = getComputedStyle(el)
      return estilo.outlineStyle === 'none' && estilo.boxShadow === 'none'
    })
    expect(sinAnillo).toBe(false)
  })

  test('hay un solo h1 por página', async ({ page }) => {
    for (const ruta of ['/', '/tienda', '/ofertas', '/contacto']) {
      await page.goto(ruta)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    }
  })

  test('toda imagen tiene alt', async ({ page }) => {
    await page.goto('/')
    const imagenes = await page.locator('img').all()

    for (const imagen of imagenes) {
      // alt="" es válido y correcto para imágenes decorativas
      expect(await imagen.getAttribute('alt')).not.toBeNull()
    }
  })

  test('el buscador tiene etiqueta accesible', async ({ page }) => {
    await irAlCatalogo(page)
    await expect(page.getByRole('searchbox', { name: /buscar en la tienda/i })).toBeVisible()
  })
})

test.describe('SEO', () => {
  test('cada página pública tiene título y descripción propios', async ({ page }) => {
    for (const ruta of ['/', '/tienda', '/ofertas', '/contacto']) {
      await page.goto(ruta)

      expect(await page.title()).toMatch(/Alma Tejida/)

      const descripcion = await page
        .locator('meta[name="description"]')
        .getAttribute('content')
      expect(descripcion?.length ?? 0).toBeGreaterThan(20)
    }
  })

  test('robots.txt excluye las zonas privadas', async ({ request }) => {
    const respuesta = await request.get('/robots.txt')
    const texto = await respuesta.text()

    expect(texto).toContain('/admin')
    expect(texto).toContain('/cuenta')
    expect(texto).toMatch(/sitemap/i)
  })

  test('el sitemap es XML válido y no incluye zonas privadas', async ({ request }) => {
    const respuesta = await request.get('/sitemap.xml')
    const texto = await respuesta.text()

    expect(texto).toContain('<urlset')
    expect(texto).not.toContain('/admin')
    expect(texto).not.toContain('/cuenta')
  })
})
