import { resolve } from 'path';

export default {
  base: './', // Use relative paths for assets
  server: {
    port: 3000,
    open: true,
    host: '0.0.0.0'
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        rockets: resolve(__dirname, 'backend/rockets.html'),
      },
      output: {
        // Ensure consistent naming for debugging
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  }
};
