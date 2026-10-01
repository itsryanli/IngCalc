/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The app makes no network requests and keeps all data on the device. This
// policy makes the browser enforce that: if a compromised dependency or deploy
// tried to send IndexedDB contents elsewhere, connect-src 'self' would block it.
// React's style={{...}} props go through the CSSOM, which style-src does not
// restrict, so 'unsafe-inline' is not needed.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Build only: the dev server injects inline scripts and opens an HMR websocket,
// which this policy would block. It goes first in <head> because a meta CSP
// only applies to what comes after it.
const contentSecurityPolicy = (): Plugin => ({
  name: 'ingcalc:csp',
  apply: 'build',
  transformIndexHtml: () => [{
    tag: 'meta',
    attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
    injectTo: 'head-prepend',
  }],
});

// GitHub Pages serves the site from /<repo>/ rather than the root, so the deploy
// workflow sets BASE_PATH. Other hosts serve from the root and leave it unset.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a new version waits until the person taps
      // Reload in UpdatePrompt, so it never reloads over a half-filled form.
      registerType: 'prompt',
      // UpdatePrompt registers the service worker itself.
      injectRegister: false,
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
