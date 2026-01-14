import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use '/' for custom domain, '/poker-tracker/' for github.io subdirectory
  base: process.env.CUSTOM_DOMAIN ? '/' : '/poker-tracker/',
})
