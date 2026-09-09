import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { citySavePlugin } from './plugins/citySave.ts'

export default defineConfig({
  // Cloudflare Pages serves from `/`. For a GitHub Pages *project* site set
  // BASE_PATH=/portfolio (or the repo name) so assets resolve under that prefix.
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss(), citySavePlugin()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
})
