import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA (Phase 9): installable app shell, online-first. The service worker PRECACHES the built
    // app shell (same-origin JS/CSS/HTML/icons) so the app installs and opens fast, but it NEVER
    // caches Supabase auth/REST/realtime — those always hit the network so stock/auth data can't
    // go stale in cache. Online-first is correct for a live multi-device POS.
    VitePWA({
      registerType: 'autoUpdate',   // new deploy -> SW updates itself; users always get the latest
      injectRegister: 'auto',       // auto-injects the SW registration (no manual code needed)
      includeAssets: ['logo.jpeg', 'pwa-icon-1024.jpg'],
      manifest: {
        name: 'ClickZone POS',
        short_name: 'ClickZone',
        description: 'ClickZone Mobiles — Point of Sale & Inventory',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000', // matches the app's default dark theme (--bg-app)
        theme_color: '#000000',
        icons: [
          { src: 'logo.jpeg', sizes: '500x500', type: 'image/jpeg', purpose: 'any' },
          { src: 'pwa-icon-1024.jpg', sizes: '1024x1024', type: 'image/jpeg', purpose: 'any' },
          { src: 'pwa-icon-1024.jpg', sizes: '1024x1024', type: 'image/jpeg', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpeg,jpg,svg,woff2}'],
        navigateFallback: '/index.html',   // SPA: offline navigations fall back to the app shell
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Never cache Supabase (auth, REST, realtime, storage) — always go to the network.
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false, // keep the SW out of `vite dev`; it activates in the production build/deploy
      },
    }),
  ],
  server: {
    port: 3000,
    host: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
