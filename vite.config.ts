import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/metronome/' : '/',
  clearScreen: false,
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  build: { target: 'es2022' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Metronome',
        short_name: 'Metronome',
        description: 'A precise metronome with custom sounds and synced visualisers.',
        theme_color: '#141416',
        background_color: '#141416',
        display: 'standalone',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Remove caches from previous SW versions so stale assets never get served.
        cleanupOutdatedCaches: true,
        // Ensure navigating to any route serves the shell (required for offline PWA).
        navigateFallback: 'index.html',
        // Don't cache the SW itself or the version manifest through the SW cache.
        navigateFallbackDenylist: [/^\/sw\.js$/, /^\/workbox-/, /^\/manifest\.webmanifest$/],
      },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
