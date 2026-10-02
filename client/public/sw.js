const CACHE_NAME = "learnhub-shell-v5";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/app-icon-192.png", "/icons/app-icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "SHOW_NOTIFICATION") {
    const { title, options = {} } = event.data;
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      const existing = clientList.find(client => "focus" in client);
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

const CACHEABLE_EXACT = new Set(["/", "/manifest.webmanifest"]);
const CACHEABLE_PREFIXES = ["/assets/", "/icons/"];
const isCacheableStatic = url =>
  url.origin === self.location.origin &&
  (CACHEABLE_EXACT.has(url.pathname) || CACHEABLE_PREFIXES.some(prefix => url.pathname.startsWith(prefix)));

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!isCacheableStatic(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put("/", response.clone()));
          return response;
        })
        .catch(() => caches.match("/").then(cached => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const refresh = fetch(request)
        .then(response => {
          if (response.ok && response.type === "basic") caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || refresh;
    })
  );
});
