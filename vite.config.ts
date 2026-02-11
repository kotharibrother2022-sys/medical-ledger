import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // VitePWA({...}) - Temporarily disabled to prevent Service Worker interference during debugging
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
  },
  base: '/',
})
