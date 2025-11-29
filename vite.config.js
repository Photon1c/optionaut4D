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
        'rockets-manual': resolve(__dirname, 'public/rockets-manual.html'),
        'rockets': resolve(__dirname, 'public/rockets.html'),
        'backend-rockets': resolve(__dirname, 'backend/rockets.html'),
      },
      output: {
        // Force ALL filenames to lowercase for Netlify/Grok compatibility
        entryFileNames: (chunkInfo) => {
          // Get entry name and force to lowercase for Netlify/Grok compatibility
          let name = chunkInfo.name || 'entry';
          
          // Normalize to lowercase with hyphens
          name = name
            .toLowerCase() // Force lowercase
            .replace(/[^a-z0-9-]/g, '-') // Replace special chars
            .replace(/-+/g, '-') // Collapse multiple hyphens
            .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
          
          return `assets/${name}-[hash].js`;
        },
        chunkFileNames: (chunkInfo) => {
          // Force all chunk names to lowercase - comprehensive handling for Netlify/Grok compatibility
          let name = 'chunk';
          
          // Try to get name from various sources (in order of preference)
          if (chunkInfo.name) {
            name = chunkInfo.name;
          } else if (chunkInfo.facadeModuleId) {
            // Extract from module path - get the filename without extension
            const pathParts = chunkInfo.facadeModuleId.split('/');
            const fileName = pathParts[pathParts.length - 1];
            name = fileName.replace(/\.[^/.]+$/, '');
          } else if (chunkInfo.moduleIds && chunkInfo.moduleIds.length > 0) {
            // Use first module ID as fallback
            const moduleId = chunkInfo.moduleIds[0];
            const pathParts = moduleId.split('/');
            const fileName = pathParts[pathParts.length - 1];
            name = fileName.replace(/\.[^/.]+$/, '');
          }
          
          // Normalize to lowercase with hyphens - remove all non-alphanumeric except hyphens
          // This ensures compatibility with case-sensitive systems like Netlify
          name = name
            .toLowerCase() // Force lowercase FIRST
            .replace(/[^a-z0-9-]/g, '-') // Replace special chars with hyphens
            .replace(/-+/g, '-') // Collapse multiple hyphens
            .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
          
          // Ensure we have a valid name
          if (!name || name.length === 0) {
            name = 'chunk';
          }
          
          return `assets/${name}-[hash].js`;
        },
        assetFileNames: (assetInfo) => {
          // Force all asset names to lowercase
          let name = 'asset';
          if (assetInfo.name) {
            name = assetInfo.name
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '');
          }
          const ext = assetInfo.name 
            ? assetInfo.name.split('.').pop().toLowerCase() 
            : 'ext';
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

