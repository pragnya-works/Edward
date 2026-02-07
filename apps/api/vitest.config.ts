import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        'tests/',
        '**/*.config.ts',
      ],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@edward/auth': path.resolve(__dirname, '../../packages/auth/dist/index.js'),
      '@edward/shared/constants': path.resolve(__dirname, '../../packages/shared/dist/constants.js'),
      '@edward/shared': path.resolve(__dirname, '../../packages/shared/dist/index.js'),
    },
  },
});
