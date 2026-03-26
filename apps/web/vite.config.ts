import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    // Prevent "process is not defined" errors from Node.js libraries (e.g. @elevenlabs/client)
    'process.env': JSON.stringify({}),
    'process': JSON.stringify({ env: {} }),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.VITE_PORT || '5173', 10),
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
