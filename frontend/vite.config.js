import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
  ],
  server: {
    // Listen on 0.0.0.0 for LAN access (e.g. https://192.168.1.77:5173)
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying for WebRTC signaling over HTTPS/WSS
      },
    },
  },
})
