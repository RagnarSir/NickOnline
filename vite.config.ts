import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from a sub-path on the OVH box (see deploy.py).
const BASE = '/NickOnline/'

// The API runs as a separate Flask process in dev. Routes carry the full public
// prefix on both sides, so there is no rewrite here and dev paths are identical
// to production ones — which matters, because the session cookie is scoped to
// Path=/NickOnline/ and would not be sent back on a rewritten path.
// xfwd adds X-Forwarded-For, so the rate limiter sees its production code path.
const api = {
  target: `http://127.0.0.1:${process.env.NICKONLINE_API_PORT ?? 8008}`,
  changeOrigin: false,
  xfwd: true,
}

export default defineConfig({
  base: BASE,
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
  server: { proxy: { [`${BASE}api`]: api } },
  // The headless-Chrome screenshot loop in CLAUDE.md runs against `vite preview`.
  preview: { proxy: { [`${BASE}api`]: api } },
})
