// ============================================================
// FrotaCTRL — Service Worker
//  - Páginas, scripts e estilos: "rede primeiro" (sempre pega a versão
//    mais nova quando há internet) com cópia guardada para quando não há.
//  - Ícones, fontes e SDK do Firebase (versionado): cache primeiro.
//  - Firestore, Auth e Cloudinary NÃO passam pelo cache.
// Para forçar todo mundo a atualizar, aumente VERSAO.
// ============================================================
const VERSAO = "frotactrl-v1";
const CACHE_APP = `${VERSAO}-app`;
const CACHE_EXTRA = `${VERSAO}-extra`;

const NUCLEO = [
  "./", "index.html", "offline.html", "manifest.webmanifest", "style.css",
  "firebase-config.js", "app.js", "auth.js", "novo-chamado.js", "telas-kanban.js", "pwa.js",
  "solicitante.html", "solicitante.js", "gestao-frota.html", "gestao-frota.js",
  "fornecedor.html", "fornecedor.js", "aprovador.html", "aprovador.js",
  "manutencao.html", "manutencao.js", "chamado.html", "chamado.js",
  "dashboard.html", "dashboard.js", "administrador.html", "administrador.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_APP).then((cache) =>
      // Um arquivo ausente não pode impedir a instalação do app
      Promise.all(NUCLEO.map((url) => cache.add(url).catch(() => null)))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => !k.startsWith(VERSAO)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// A página pede a troca de versão quando o usuário toca em "Atualizar"
self.addEventListener("message", (event) => {
  if (event.data === "PULAR_ESPERA") self.skipWaiting();
});

const HOSTS_EXTRA = ["fonts.googleapis.com", "fonts.gstatic.com"];
const ehSdkFirebase = (u) => u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Mesmo domínio: rede primeiro, cache como reserva
  if (url.origin === self.location.origin) {
    event.respondWith(redePrimeiro(req));
    return;
  }
  // Fontes e SDK do Firebase (arquivos versionados): cache primeiro
  if (HOSTS_EXTRA.includes(url.hostname) || ehSdkFirebase(url)) {
    event.respondWith(cachePrimeiro(req));
  }
  // Todo o resto (Firestore, Auth, Cloudinary…) segue direto para a rede
});

async function redePrimeiro(req) {
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) {
      const copia = resp.clone();
      caches.open(CACHE_APP).then((c) => c.put(req, copia)).catch(() => {});
    }
    return resp;
  } catch (err) {
    const guardado = await caches.match(req, { ignoreSearch: true });
    if (guardado) return guardado;
    if (req.mode === "navigate") return (await caches.match("offline.html")) || Response.error();
    return Response.error();
  }
}

async function cachePrimeiro(req) {
  const guardado = await caches.match(req);
  if (guardado) return guardado;
  try {
    const resp = await fetch(req);
    if (resp && (resp.ok || resp.type === "opaque")) {
      const copia = resp.clone();
      caches.open(CACHE_EXTRA).then((c) => c.put(req, copia)).catch(() => {});
    }
    return resp;
  } catch (err) {
    return Response.error();
  }
}
