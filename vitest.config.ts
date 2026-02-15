import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'build/**',
        'node_modules/**',
        '*.config.*',
        'src/index.ts', // Server entry point, tested via MCP Inspector
      ],
    },
  },
});
