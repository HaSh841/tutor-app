// Connects to the Firebase Realtime Database using the VITE_FIREBASE_* values from .env.local
import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// the database is only created when the important values are there
const ready = Boolean(config.databaseURL && config.projectId)

if (!ready) {
  console.warn('Firebase is not configured: add the VITE_FIREBASE_* values to .env.local')
}

export const db = ready ? getDatabase(initializeApp(config)) : null