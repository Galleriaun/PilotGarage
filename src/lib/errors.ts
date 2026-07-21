/**
 * Supabase RPC errors are PostgrestError objects, NOT Error instances — so
 * `err instanceof Error` misses them and the server's raised Turkish message
 * (e.g. "Geri alınmış aktarım silinemez.") gets lost. Read `.message` off
 * whatever shape we got.
 */
export function rpcErrorText(err: unknown, fallback: string): string {
  const m = (err as { message?: unknown } | null)?.message
  return typeof m === 'string' && m.trim() !== '' ? m : fallback
}
