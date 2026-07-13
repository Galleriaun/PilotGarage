import { createClient } from '@supabase/supabase-js'
import { safeStorage } from './storage'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Supabase ortam değişkenleri eksik: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY',
  )
}

// safeStorage: sessions survive normally; in storage-restricted contexts
// (private mode, sandboxed webviews) auth falls back to in-memory instead
// of crashing the app.
export const supabase = createClient(url, key, {
  auth: { storage: safeStorage },
})
