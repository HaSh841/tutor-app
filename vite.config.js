import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'node:https'
import process from 'node:process'

// only connect to Google over IPv4, and give up after 10 seconds
const ipv4Agent = new https.Agent({ family: 4, keepAlive: true, timeout: 10000 })

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  if (!env.AI_API_KEY) {
    console.warn('\n[vite] AI_API_KEY is missing. Add it to .env.local and restart.')
    console.warn('[vite] Looking in:', process.cwd())
    console.warn('[vite] Variables found in env files:', Object.keys(env).filter((k) => /KEY|API|AI/i.test(k)), '\n')
  }

  return {
    plugins: [react()],
    server: {
      host: true,   // lets other computers on your network open the site
      proxy: {
        // saved sessions
        '/api/session': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        // Gemini
        '/api/ai': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          agent: ipv4Agent,
          rewrite: (path) => path.replace(/^\/api\/ai/, '/v1beta/openai'),
          headers: { Authorization: `Bearer ${env.AI_API_KEY}` },
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.error('[proxy] Gemini request failed:', err.code, err.message)
            })
          },
        },
      },
    },
  }
})