import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDesktopBuild = process.env.VITE_STREAMNYAA_APP_TARGET === 'desktop';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  esbuild: {
    legalComments: 'none',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    reportCompressedSize: !isDesktopBuild,
    chunkSizeWarningLimit: isDesktopBuild ? 1200 : 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-player')) return 'player';
          if (id.includes('motion')) return 'motion';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'react';
          return 'vendor';
        },
      },
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
