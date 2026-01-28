import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        strictPort: true,
        hmr: {
          // Enable HMR for Codespaces
          clientPort: 443,
          protocol: 'wss',
        },
        // Allow access from Codespaces forwarded ports
        cors: true,
        // Configure headers for Codespaces
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
