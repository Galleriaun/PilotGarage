import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/PilotGarage/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'PilotGarage',
        short_name: 'PilotGarage',
        description: 'PilotGarage & Arabam.com işletme yönetimi',
        lang: 'tr',
        dir: 'ltr',
        start_url: '/PilotGarage/',
        scope: '/PilotGarage/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#111111',
        background_color: '#ffffff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell + fonts precached; Supabase stays network-only (no
        // runtimeCaching on purpose — finance data must never be stale).
        globPatterns: ['**/*.{js,css,html,woff2,png}'],
        navigateFallback: '/PilotGarage/index.html',
      },
    }),
  ],
})
