/* Web Push handlers — imported into the generated Workbox service worker
   via vite-plugin-pwa `workbox.importScripts`. */

self.addEventListener('push', (event) => {
  if (!event.data) return
  let d = {}
  try {
    d = event.data.json()
  } catch {
    d = { title: 'PilotGarage', body: event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'PilotGarage', {
      body: d.body || '',
      icon: '/PilotGarage/icons/icon-192.png',
      badge: '/PilotGarage/icons/icon-192.png',
      data: { link: d.link || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'
  const url = '/PilotGarage' + link
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url)
          return c.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})
