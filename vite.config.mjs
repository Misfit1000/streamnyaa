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
  define: { __STREAMNYAA_WEB_BUILD__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || process.env.STREAMNYAA_BUILD_REVISION || 'local') },
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
      }] : [{
        // A shared card's native hover helper otherwise pulls the complete
        // desktop page graph into the website's shared startup chunks.
        find: /^.*\/desktopRoutePreload(?:\.ts)?$/,
        replacement: path.resolve(__dirname, 'src/lib/webDesktopRoutePreload.ts'),
      }]),
    ],
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  build: isDesktopTarget
    ? {
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
      }
    : {
        manifest: true,
        target: 'es2022',
        cssCodeSplit: true,
        rollupOptions: {
          output: {
            manualChunks: {
              'web-vendor': ['react', 'react-dom', 'react-router-dom'],
              'web-query': ['@tanstack/react-query'],
              'web-motion': ['motion'],
            },
          },
        },
      },
});
