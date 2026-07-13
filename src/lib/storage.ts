/**
 * localStorage that never throws. In storage-restricted contexts (Safari
 * private mode, sandboxed/embedded webviews) even READING
 * `window.localStorage` throws a SecurityError — unguarded, that crashes the
 * app before first paint (black screen). This wrapper probes once and falls
 * back to an in-memory map: persistence is lost there, but the app works.
 */
const memory = new Map<string, string>()

function nativeStorage(): Storage | null {
  try {
    const s = window.localStorage
    // Older Safari private mode allowed reads but threw on writes — probe both.
    const probe = '__pg_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

const store = nativeStorage()

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return store ? store.getItem(key) : (memory.get(key) ?? null)
    } catch {
      return memory.get(key) ?? null
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (store) {
        store.setItem(key, value)
        return
      }
    } catch {
      // quota/security error -> fall through to memory
    }
    memory.set(key, value)
  },
  removeItem(key: string): void {
    try {
      store?.removeItem(key)
    } catch {
      // ignore
    }
    memory.delete(key)
  },
}
