import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDesktopTarget = process.env.VITE_STREAMNYAA_APP_TARGET === 'desktop';
const seoComponentPath = path.resolve(__dirname, 'src/components/Seo.tsx');
const desktopSeoComponentPath = path.resolve(__dirname, 'src/components/SeoDesktop.tsx');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: isDesktopTarget ? false : path.resolve(__dirname, 'public'),
  resolve: {
    preserveSymlinks: true,
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, '.'),
      },
      {
        find: '@app-entry',
        replacement: path.resolve(__dirname, isDesktopTarget ? 'src/AppDesktop.tsx' : 'src/App.tsx'),
      },
      ...(isDesktopTarget ? [{
        find: seoComponentPath,
        replacement: desktopSeoComponentPath,
      }] : []),
    ],
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  build: isDesktopTarget ? {
    target: 'es2022',
    modulePreload: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'desktop-vendor': ['react', 'react-dom', 'react-router-dom'],
          'desktop-query': ['@tanstack/react-query'],
        },
      },
    },
  } : undefined,
});
