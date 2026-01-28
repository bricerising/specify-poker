import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'game',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
    },
  },
]);
