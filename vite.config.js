export default {
  server: {
    port: 3000,
    open: true,
    host: '0.0.0.0'
  },
  build: {
    target: 'esnext'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  }
};
