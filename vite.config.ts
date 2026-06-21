import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const apiProxyTarget = env.VITE_API_PROXY_TARGET || '';

    const serverConfig: {
      port: number;
      host: string;
      proxy?: Record<string, unknown>;
    } = {
      port: 5000,
      host: '0.0.0.0',
    };

    if (apiProxyTarget) {
      serverConfig.proxy = {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      };
    }

    return {
      server: serverConfig,
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
