import { resolve } from 'path';

export default {
  server: {
    port: 3000,
    open: true,
    host: '0.0.0.0'
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        rockets: resolve(__dirname, 'backend/rockets.html'),
      }
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  }
};
