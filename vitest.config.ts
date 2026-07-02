import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests hit a real Supabase instance; they self-skip when
    // env isn't configured, but we still want a sensible default timeout.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
})
