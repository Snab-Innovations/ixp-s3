import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0'
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
        // amazon-cognito-identity-js (via buffer) expects Node's `global` in the browser
        global: 'globalThis',
        'process.env.ANTHROPIC_API_KEY': JSON.stringify(env.VITE_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY),
        'process.env.ANTHROPIC_BASE_URL': JSON.stringify(env.VITE_ANTHROPIC_BASE_URL || env.ANTHROPIC_BASE_URL),
        'process.env.ANTHROPIC_WORKSPACE_ID': JSON.stringify(env.VITE_ANTHROPIC_WORKSPACE_ID || env.ANTHROPIC_WORKSPACE_ID || 'default'),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
