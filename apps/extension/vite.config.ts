import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@arcable/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 5173,
    open: '/src/popup/index.html',
  },
});
