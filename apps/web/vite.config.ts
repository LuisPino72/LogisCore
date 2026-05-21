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
      includeAssets: ['Emblema.ico'],
      manifest: {
        name: 'LogisCore ERP',
        short_name: 'LogisCore',
        description: 'Sistema de gestión para PYMES y bodegas',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/Emblema.ico',
            sizes: '64x64',
            type: 'image/x-icon',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 4.5 * 1024 * 1024, // 4.5 MB
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
