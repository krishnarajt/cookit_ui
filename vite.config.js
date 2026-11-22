import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a silent reload mid-keystroke throws away
      // whatever was being typed. src/components/PwaUpdate.jsx offers it instead.
      registerType: 'prompt',
      // The manifest lives here so there is exactly one of it — a static copy
      // in public/ would be overwritten by the generated one at build time.
      manifest: {
        "name": "Cookit",
        "short_name": "Cookit",
        "description": "Stop deciding, start cooking: what to make tonight from what you already have.",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": "#14100e",
        "theme_color": "#14100e",
        "categories": [
          "food",
          "lifestyle"
        ],
        "icons": [
          {
            "src": "/icon-192.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any"
          },
          {
            "src": "/icon-512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any"
          },
          {
            "src": "/icon-maskable-512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "maskable"
          },
          {
            "src": "/favicon.svg",
            "sizes": "any",
            "type": "image/svg+xml",
            "purpose": "any"
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Everything this app shows is live data behind a session, so nothing
        // under /api may ever be answered from the cache.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Fonts are the one third-party fetch worth caching: immutable, and
            // without them the shell renders in a fallback face offline.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // The dev server proxies /api to a locally running backend, so the app can
    // be developed without VITE_API_BASE_URL pointing anywhere public.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API || 'http://localhost:8020',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // framer-motion is a good third of the bundle and changes far less
        // often than the app does — splitting it keeps the app chunk small and
        // cacheable across deploys.
        manualChunks: {
          motion: ['framer-motion'],
        },
      },
    },
  },
});
