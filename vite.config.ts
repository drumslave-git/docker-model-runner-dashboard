import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createDmrApp } from './server/app';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dmr-api',
      configureServer(server) {
        server.middlewares.use(createDmrApp());
      }
    }
  ],
  server: {
    port: 5300
  }
});
