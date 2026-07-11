// PilotGarage — send-push Edge Function
// Called by a database webhook on INSERT into public.notifications.
// Reads the recipient's push subscriptions (service role) and web-pushes
// the notification to every device; dead subscriptions are pruned.
// Deploy with "Verify JWT" DISABLED; the webhook authenticates via the
// x-push-secret header instead.
//
// Required secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_WEBHOOK_SECRET
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

webpush.setVapidDetails(
  'mailto:hgyetkili@gmail.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const PREF_OF_TYPE: Record<string, string> = {
  ONAY: 'onay',
  KAYIT_SILME: 'silme',
  UYELIK: 'uyelik',
}

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_WEBHOOK_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }

  const { record } = await req.json()
  if (!record?.profile_id) return new Response('ignored')

  // respect the recipient's per-type preference (missing key = enabled)
  const { data: prof } = await supabase
    .from('profiles')
    .select('notif_prefs')
    .eq('id', record.profile_id)
    .single()
  const prefs = (prof?.notif_prefs ?? {}) as Record<string, boolean>
  const prefKey = PREF_OF_TYPE[record.type as string]
  if (prefKey && prefs[prefKey] === false) return new Response('skipped')

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('profile_id', record.profile_id)

  const payload = JSON.stringify({
    title: record.baslik ?? 'PilotGarage',
    body: record.body ?? '',
    link: record.link ?? '/',
  })

  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }),
  )
  return new Response('ok')
})
