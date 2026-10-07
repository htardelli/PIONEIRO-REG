import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Publicado em https://htardelli.github.io/PIONEIRO-REG/
export default defineConfig({
  base: '/PIONEIRO-REG/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Pioneiro-REG',
        short_name: 'Pioneiro',
        description: 'Registro e acompanhamento de horas do pioneiro regular',
        lang: 'pt-BR',
        theme_color: '#1F4E79',
        background_color: '#EEF1F5',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
