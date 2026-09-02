import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { citySavePlugin } from './plugins/citySave.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), citySavePlugin()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
})
