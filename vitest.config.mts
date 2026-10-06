import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Hace falta para las pruebas de componentes (.tsx): sin esto, esbuild no
  // sabe transformar el JSX con el runtime automatico de React 19.
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    // `node` por defecto: casi todas las pruebas son de base de datos y
    // levantar un DOM para ellas seria pagar por nada. Las que necesitan
    // navegador lo piden con `// @vitest-environment jsdom` en su cabecera.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts'],
    // Cada archivo de pruebas levanta su propio Postgres en memoria.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
})
