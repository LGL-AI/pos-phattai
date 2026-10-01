const CACHE_VERSION='lotus-pos-v12-2-2-pwa-20260921-6';
const APP_SHELL=[
  './index.html','./lotus-v12.2.1.css','./lotus-v12.2.1.js','./qrcode-standalone.js','./echo-coffee-logo.jpg',
  './staff.webmanifest','./customer.webmanifest','./offline.html','./staff/','./qr/',
  './fonts/noto-sans-sc-400.woff2','./fonts/noto-sans-sc-700.woff2',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-192.png','./icons/icon-maskable-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_VERSION).then(cache=>cache.addAll(APP_SHELL)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

function isSensitive(url){
  return /\/(api|webhook|payment|license-server)\//i.test(url.pathname);
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||isSensitive(url))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE_VERSION).then(cache=>cache.put(request,copy));
      return response;
    }).catch(async()=>{
      const exact=await caches.match(request);
      if(exact)return exact;
      const shell=await caches.match('./index.html',{ignoreSearch:true});
      return shell||caches.match('./offline.html');
    }));
    return;
  }
  event.respondWith(fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE_VERSION).then(cache=>cache.put(request,copy));}
    return response;
  }).catch(()=>caches.match(request)));
});
