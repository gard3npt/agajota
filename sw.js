/* AGAJOTA – service worker
   - Páginas (index.html): rede primeiro, para veres sempre a versão mais recente; sem ligação usa a cópia guardada.
   - Ícones e ficheiros da app: cache primeiro.
   - Tailwind e tipos de letra (outros domínios): usa a cópia guardada e atualiza em segundo plano.
   - Tudo o resto (YouTube, anúncios, tradutor…) passa direto, sem ser guardado.
   Quando mudares ficheiros da app, sobe o número da VERSAO para limpar caches antigas. */
const VERSAO = 'v1';
const CACHE_APP = 'agajota-app-' + VERSAO;
const CACHE_EXTRA = 'agajota-extra-' + VERSAO;
const FICHEIROS_APP = [
  './', 'index.html', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.png'
];
const DOMINIOS_EXTRA = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_APP)
      // um ficheiro em falta (ex.: favicon.png) não deve impedir a instalação
      .then(function (c) { return Promise.all(FICHEIROS_APP.map(function (f) { return c.add(f).catch(function () {}); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (chaves) {
        return Promise.all(chaves
          .filter(function (k) { return k.indexOf('agajota-') === 0 && k !== CACHE_APP && k !== CACHE_EXTRA; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Páginas: rede primeiro
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(function (r) {
          if (r && r.ok && url.origin === location.origin) {
            const copia = r.clone();
            caches.open(CACHE_APP).then(function (c) { c.put('index.html', copia); });
          }
          return r;
        })
        .catch(function () { return caches.match('index.html').then(function (r) { return r || caches.match('./'); }); })
    );
    return;
  }

  // Ficheiros da própria app: cache primeiro
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(function (r) {
        return r || fetch(req).then(function (resp) {
          if (resp && resp.ok) {
            const copia = resp.clone();
            caches.open(CACHE_APP).then(function (c) { c.put(req, copia); });
          }
          return resp;
        });
      })
    );
    return;
  }

  // Tailwind e fontes: cópia guardada + atualização em segundo plano
  if (DOMINIOS_EXTRA.indexOf(url.hostname) !== -1) {
    e.respondWith(
      caches.open(CACHE_EXTRA).then(function (c) {
        return c.match(req).then(function (guardada) {
          const rede = fetch(req).then(function (resp) {
            if (resp && (resp.ok || resp.type === 'opaque')) c.put(req, resp.clone());
            return resp;
          }).catch(function () { return guardada; });
          return guardada || rede;
        });
      })
    );
  }
  // restantes pedidos: comportamento normal do browser
});
