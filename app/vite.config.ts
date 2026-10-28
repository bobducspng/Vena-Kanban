import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
// VITE_BASE_PATH: subcaminho onde o app é servido (ex.: /fluxos/ atrás do nginx).
// Vazio = raiz (dev).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: loadEnv(mode, process.cwd()).VITE_BASE_PATH || '/',
}))
