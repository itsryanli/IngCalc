/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo>/ rather than the root, so the deploy
// workflow sets BASE_PATH. Other hosts serve from the root and leave it unset.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'IngCalc',
        short_name: 'IngCalc',
        description: 'Raw to cooked weights, nutrients and cost per gram of protein',
        theme_color: '#1f2933',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // The forks pool spawns a process per test file, which fails intermittently
    // under load ("Failed to start forks worker") and reports it as a failing
    // suite. Phase 3 execution record §5.
    pool: 'threads',
  },
});
