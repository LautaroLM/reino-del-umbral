import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    port: 3001,
  },
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@ao/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@ao/shared-protocol': path.resolve(__dirname, '../../packages/shared-protocol/src/index.ts'),
      '@ao/shared-constants': path.resolve(__dirname, '../../packages/shared-constants/src/index.ts'),
      '@ao/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src/index.ts'),
    },
  },
});
