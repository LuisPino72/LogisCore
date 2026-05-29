import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['Sasa.png', 'Sasa con fondo.png'],
      manifest: {
        name: 'Sasa ERP',
        short_name: 'Sasa',
        description: 'Sistema de gestión para PYMES y bodegas',
        theme_color: '#0D9488',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/Sasa.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/Sasa con fondo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 4.5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Cachea las imágenes de productos de Supabase Storage con StaleWhileRevalidate
            // Sirve de respaldo offline cuando imageCacheService no las ha precargado
            urlPattern: /\/storage\/v1\/object\/public\/Products\/[^?]+/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'logiscore-supabase-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 días
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    host: process.env.VITE_DEV_HOST === 'true' ? true : 'localhost',
  },
});
