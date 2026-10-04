import { defineConfig, devices } from '@playwright/test'

/**
 * Pruebas de navegador.
 *
 * Las de `tests/e2e/tienda.spec.ts` corren SIN base de datos: verifican la
 * cáscara, la navegación, los estados vacíos, el carrito en localStorage, la
 * accesibilidad y el responsive. Son las que se pueden correr hoy.
 *
 * Las de `catalogo.spec.ts` necesitan productos publicados y se saltean solas
 * si el catálogo está vacío.
 *
 * Los seis tamaños del punto 204: iPhone chico, iPhone grande, Android,
 * tablet, notebook y escritorio amplio.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // Dos trabajadores y no "todos los nucleos": el servidor de desarrollo mas
  // varios navegadores a la vez agotan la memoria del proceso de Node.
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? 'github' : 'list',

  // Margen para el arranque en frío; una prueba sana tarda menos de 5s.
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Cordoba',
  },

  projects: [
    { name: 'iphone-chico', use: { ...devices['iPhone SE'] } },
    { name: 'iphone-grande', use: { ...devices['iPhone 14 Pro Max'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', use: { ...devices['iPad Mini'] } },
    { name: 'notebook', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  ],

  /**
   * Contra el BUILD DE PRODUCCIÓN, no contra el servidor de desarrollo.
   *
   * En desarrollo, Next compila cada ruta la primera vez que alguien la pide,
   * y esa compilación agotaba el tiempo de las pruebas. Además el servidor de
   * desarrollo no prerenderiza: cada visita rehace el trabajo que en
   * producción ocurre una sola vez. Probar sobre el build mide lo que la
   * persona va a recibir de verdad.
   */
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
