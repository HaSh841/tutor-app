import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [react()],
    server: {
      host: true,   // lets other computers on your network open the site
      proxy: {
        // Gemini
        '/api/ai': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/ai/, '/v1beta/openai'),
          headers: { Authorization: `Bearer ${env.AI_API_KEY}` },
        },
      },
    },
  }
})