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
        rockets: resolve(__dirname, 'public/rockets.html'), // Non-parser version
      },
      output: {
        // Ensure consistent naming for debugging - lowercase for compatibility
        entryFileNames: (chunkInfo) => {
          // Force lowercase name for compatibility (Grok and other tools)
          const name = 'rockets'; // Always use lowercase
          // Vite/Rollup will replace [hash] placeholder even in function return
          return `assets/${name}-[hash].js`;
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  },
  resolve: {
    alias: {
      // Ensure consistent path resolution for Three.js modules
      '@': resolve(__dirname, 'src')
    }
  }
};

