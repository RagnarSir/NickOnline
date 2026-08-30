import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from a sub-path on the OVH box (see deploy.py).
export default defineConfig({
  base: '/NickOnline/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
})
