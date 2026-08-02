import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/resend': {
            target: 'https://api.resend.com',
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/api\/resend/, '')
          }
        }
      },
      plugins: [tailwindcss(), react()],
      optimizeDeps: {
        esbuildOptions: {
          target: 'esnext',
        },
      },
      build: {
        target: 'esnext',
      },
      define: {
        'process.env.XAI_API_KEY': JSON.stringify(env.VITE_XAI_API_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
