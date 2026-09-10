import { defineConfig } from 'vite'
import honox from 'honox/vite'

export default defineConfig({
  plugins: [honox()],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    ssr: 'app/server.ts',
    rollupOptions: {
      output: {
        entryFileNames: 'server.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
})
