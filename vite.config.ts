import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { SITE_BASE_PATH } from './site.config';

const base = process.env.VITE_BASE_PATH ?? SITE_BASE_PATH;

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: {
    // Allow access from other devices on LAN (mobile testing).
    host: true,
    port: 5173,
    strictPort: true,
  },
});
