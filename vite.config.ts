import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Только для дев-туннеля (jprq/ngrok), которым мини-апп открывают в Telegram:
  // Vite иначе режет запросы с чужим Host. На прод-сборку не влияет.
  server: {
    allowedHosts: ['.jprq.live'],
  },
})
