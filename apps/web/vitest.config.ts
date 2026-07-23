import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Web unit tests run against the shared package's TypeScript source directly, the
// same way the app resolves it. Component/DOM tests would additionally need jsdom
// and testing-library; the pure access rules below run in a plain node env.
export default defineConfig({
  resolve: {
    alias: {
      '@barbershop/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
