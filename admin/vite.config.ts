import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Shanti Admin',
        short_name: 'Shanti',
        description: 'Panel de pedidos — Arrocería Shanti',
        start_url: '/admin',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#059669',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallback: '/admin/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3}'],
      },
    }),
  ],
  base: '/admin/',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'https://shanti-bot.pixpro.lat',
    },
  },
});
