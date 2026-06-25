// =============================================
// AQARATI - Service Worker
// عقاراتي - خادم الخلفية للعمل بدون إنترنت
// =============================================

const CACHE_NAME = "aqarati-v2";
const STATIC_CACHE = "aqarati-static-v2";
const DYNAMIC_CACHE = "aqarati-dynamic-v2";

// الملفات التي تُحفظ للعمل بدون إنترنت
const STATIC_FILES = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// ── التثبيت: حفظ الملفات الأساسية ──
self.addEventListener("install", event => {
  console.log("[SW] Installing Aqarati Service Worker...");
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log("[SW] Caching static files");
      return cache.addAll(STATIC_FILES);
    }).then(() => self.skipWaiting())
  );
});

// ── التفعيل: حذف الكاش القديم ──
self.addEventListener("activate", event => {
  console.log("[SW] Activating Aqarati Service Worker...");
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── الاعتراض: استراتيجية Cache First ──
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل الطلبات غير HTTP
  if (!request.url.startsWith("http")) return;

  // تجاهل طلبات Firebase و APIs الخارجية
  if (
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("api.anthropic.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cachedResponse => {
      // إذا موجود في الكاش → أرجعه فوراً
      if (cachedResponse) {
        // في الخلفية: حدّث الكاش من الشبكة
        fetch(request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, networkResponse.clone());
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      // إذا غير موجود → اجلبه من الشبكة
      return fetch(request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        // احفظه في الكاش الديناميكي
        const responseToCache = networkResponse.clone();
        caches.open(DYNAMIC_CACHE).then(cache => {
          cache.put(request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // بدون إنترنت → أرجع الصفحة الرئيسية المحفوظة
        if (request.destination === "document") {
          return caches.match("/index.html");
        }
      });
    })
  );
});

// ── الإشعارات ──
self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "عقاراتي 🏘️";
  const options = {
    body: data.body || "لديك إشعار جديد",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-72.png",
    dir: "rtl",
    lang: "ar",
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" },
    actions: [
      { action: "open", title: "فتح التطبيق" },
      { action: "close", title: "إغلاق" }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "open" || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || "/")
    );
  }
});
