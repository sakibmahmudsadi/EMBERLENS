import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/maplibre-gl/')) return 'vendor-maplibre';
            if (id.includes('/node_modules/react-dom/')) return 'vendor-react-dom';
            if (id.includes('/node_modules/react/')) return 'vendor-react';
          },
        },
      },
    },
  };
});
