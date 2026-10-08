import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:* http://localhost:*",
].join('; ')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { headers: { 'Content-Security-Policy': contentSecurityPolicy } },
  preview: { headers: { 'Content-Security-Policy': contentSecurityPolicy } },
})
