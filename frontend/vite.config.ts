import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Honour PORT when set (e.g. the Claude Code preview harness), else the Vite default.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    proxy: {
      // Frontend calls "/api/..." and Vite forwards to the backend in dev.
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
});
