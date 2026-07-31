const CACHE='offramp-v2';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./kernel/offramp.mjs','./kernel/sha256.mjs','./kernel/attractor.mjs','./kernel/fold.mjs','./kernel/eth.mjs','./kernel/fall-remember.mjs'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(k=>k.put(e.request,c)).catch(()=>{});return r}).catch(()=>caches.match(e.request)))});
