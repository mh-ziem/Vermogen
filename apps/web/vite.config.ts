import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '127.0.0.1',
    // Em desenvolvimento, a tela chama a API local pela mesma origem (sem CORS, como em produção).
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
})
