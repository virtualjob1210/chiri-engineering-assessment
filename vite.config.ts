import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { suggestApi } from './server/suggestPlugin.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Loads OPENROUTER_* from .env for the server only. The client bundle only
  // ever sees VITE_-prefixed variables, so the key never reaches the browser.
  const env = loadEnv(mode, process.cwd(), 'OPENROUTER_')

  return {
    plugins: [
      react(),
      suggestApi({ apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL }),
    ],
  }
})
