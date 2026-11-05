// Service worker：只負責瀏覽器推播（價位提醒到價時，網頁關著也能跳通知）。
// 不做離線快取，避免舊版畫面被快取住。
// 部署在 GitHub Pages 的子路徑（/Tarot-fontEnd/），所有網址都以 registration.scope 為基準。

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// 後端送來的內容：{ title, body, url }，url 是相對於網站根目錄的路徑（例如 market?tab=alerts）
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: '價位提醒', body: event.data ? event.data.text() : '' }
  }
  const scope = self.registration.scope
  event.waitUntil(
    self.registration.showNotification(data.title || '價位提醒', {
      body: data.body || '',
      icon: new URL('apple-touch-icon.png', scope).href,
      badge: new URL('apple-touch-icon.png', scope).href,
      // 同一則提醒不要疊好幾個通知
      tag: data.title || 'market-alert',
      data: { url: new URL(data.url || 'market?tab=alerts', scope).href },
    }),
  )
})

// 點通知：已經開著網站就切過去，否則開新視窗
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.registration.scope))
      if (existing) {
        return existing.focus().then((client) => (client && 'navigate' in client ? client.navigate(url) : undefined))
      }
      return self.clients.openWindow(url)
    }),
  )
})
