import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'a4b179129da0.ngrok-free.app',
      '.ngrok-free.app',
      '.ngrok.io',
    ],
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      process: 'process/browser',
      util: 'util',
      events: 'events',
      stream: 'stream-browserify',
      crypto: 'crypto-browserify',
      assert: 'assert',
      vm: 'vm-browserify',
    },
  },
  define: {
    'process.env': {},
    global: 'window',
  },
});
