import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // Cada archivo de pruebas levanta su propio Postgres en memoria.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
})
