import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    // VITE_BASE: '/' for local/same-origin, '/DI-/' for GitHub Pages project site
    base: process.env.VITE_BASE || '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'favicon.svg',
          'apple-touch-icon.png',
          'earth-one-icon.png',
          'earth-one-cover.jpg',
        ],
        manifest: {
          id: '/',
          name: 'EARTH ONE — One World. Infinite Possibilities.',
          short_name: 'ONE',
          description:
            'EARTH ONE — One World. Infinite Possibilities. 一个世界，无限可能。',
          lang: 'zh-CN',
          dir: 'ltr',
          orientation: 'any',
          theme_color: '#05070B',
          background_color: '#05070B',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          start_url: '/',
          scope: '/',
          prefer_related_applications: false,
          categories: ['social', 'communication', 'music', 'education'],
          shortcuts: [
            {
              name: '信息聊天',
              short_name: '信息',
              description: '直接打开独立聊天信息界面',
              url: '/?module=chat',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: '音乐空间',
              short_name: '音乐',
              description: '打开独立音乐播放器',
              url: '/?module=venus',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: '语言学习',
              short_name: '语言',
              description: '打开语言学习中心',
              url: '/?module=arabic-learning',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
          runtimeCaching: [],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three/')) return 'vendor-three';
            if (id.includes('node_modules/livekit-client/')) return 'vendor-livekit';
            if (id.includes('node_modules/lucide-react/')) return 'vendor-icons';
          },
        },
      },
    },
    server: {
      // Allow production domain (燃灯同学.com) and AI Studio preview hosts without disabling host checks.
      allowedHosts: ['xn--dqry4os3s3gb.com', '.xn--dqry4os3s3gb.com', '.run.app', 'localhost', '127.0.0.1'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
