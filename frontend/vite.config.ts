/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev server proxies API + SignalK-native endpoints to a running SignalK
// server (§12.2). Override the target with SIGNALK_URL if yours isn't local.
const signalk = process.env.SIGNALK_URL ?? 'http://localhost:3000';

export default defineConfig({
  // served from /signalk-maintenance-tracker/ — assets must be relative (§7.1)
  base: './',
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/plugins/signalk-maintenance-tracker': { target: signalk, changeOrigin: true },
      '/signalk': { target: signalk, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
  },
});
