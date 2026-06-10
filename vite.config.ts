import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';
import { SITE_BASE_PATH } from './site.config';

const base = process.env.VITE_BASE_PATH ?? SITE_BASE_PATH;
const useHttp = process.env.VITE_HTTP === '1';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), ...(useHttp ? [] : [basicSsl()])],
  server: {
    // Allow access from other devices on LAN (mobile testing).
    host: true,
    port: 5173,
    strictPort: true,
  },
});
