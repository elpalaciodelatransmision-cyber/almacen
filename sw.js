// Hace que el almacén funcione sin internet y abra al instante.
//
// Por qué importa aquí: en el almacén la señal se cae. El inventario vive en
// el navegador del equipo (localStorage), así que lo único que faltaba para
// poder trabajar sin señal era guardar la propia página y sus librerías.
//
// Regla: la página SIEMPRE se pide primero a internet, para que una versión
// nueva entre sola. Si no hay señal, se sirve la última guardada. Las
// librerías de fuera (Excel, códigos de barras, lector de fotos) no cambian
// nunca, así que esas se sirven de lo guardado y listo.
const CACHE = 'almacen-palacio-v1'
const BASE = new URL('./', self.location).pathname
const PROPIOS = [BASE, BASE + 'index.html', BASE + 'manifest.json',
                 BASE + 'img/icono-192.png', BASE + 'img/icono-512.png']

self.addEventListener('install', (e) => {
  // addAll falla entero si uno solo falla; por eso van de a uno.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE)
    await Promise.all(PROPIOS.map((u) => c.add(u).catch(() => {})))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const n of await caches.keys()) if (n !== CACHE) await caches.delete(n)
  await self.clients.claim()
})()))

// Las librerías de fuera traen la versión en la dirección, así que una vez
// guardadas sirven para siempre.
const deFuera = (url) => url.hostname === 'cdn.jsdelivr.net'

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  let url
  try { url = new URL(req.url) } catch { return }

  // Supabase y cualquier otra consulta de datos: siempre en vivo, nunca guardada.
  if (url.hostname.endsWith('.supabase.co')) return

  if (deFuera(url)) {
    e.respondWith((async () => {
      const guardado = await caches.match(req)
      if (guardado) return guardado
      try {
        const red = await fetch(req)
        if (red.ok || red.type === 'opaque') (await caches.open(CACHE)).put(req, red.clone())
        return red
      } catch (err) {
        return Response.error()
      }
    })())
    return
  }

  // Lo propio: primero internet (para que una versión nueva entre sola),
  // y si no hay señal, lo último que quedó guardado.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      try {
        const red = await fetch(req)
        if (red.ok) (await caches.open(CACHE)).put(req, red.clone())
        return red
      } catch (err) {
        const guardado = await caches.match(req)
        if (guardado) return guardado
        if (req.mode === 'navigate') {
          const inicio = await caches.match(BASE + 'index.html') || await caches.match(BASE)
          if (inicio) return inicio
        }
        return Response.error()
      }
    })())
  }
})
