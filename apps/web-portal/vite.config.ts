import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
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
