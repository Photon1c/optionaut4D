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
        'rockets-manual': resolve(__dirname, 'backend/rockets.html'), // Manual input version
      },
      output: {
        // Ensure consistent naming for debugging - lowercase for compatibility (Grok-friendly)
        entryFileNames: (chunkInfo) => {
          // Force lowercase name for compatibility (Grok and other tools)
          const name = 'rockets-manual'; // Always use lowercase
          // Vite/Rollup will replace [hash] placeholder even in function return
          return `assets/${name}-[hash].js`;
        },
        chunkFileNames: (chunkInfo) => {
          // Force all chunk names to lowercase - handle both named and dynamic chunks
          let name = 'chunk';
          if (chunkInfo.name) {
            name = chunkInfo.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          } else if (chunkInfo.facadeModuleId) {
            // Extract name from module path
            const moduleName = chunkInfo.facadeModuleId.split('/').pop().replace(/\.[^/.]+$/, '').toLowerCase();
            name = moduleName.replace(/[^a-z0-9-]/g, '-');
          }
          return `assets/${name}-[hash].js`;
        },
        assetFileNames: (assetInfo) => {
          // Force all asset names to lowercase
          let name = 'asset';
          if (assetInfo.name) {
            name = assetInfo.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          }
          const ext = assetInfo.name ? assetInfo.name.split('.').pop().toLowerCase() : 'ext';
          return `assets/${name}-[hash].${ext}`;
        }
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
