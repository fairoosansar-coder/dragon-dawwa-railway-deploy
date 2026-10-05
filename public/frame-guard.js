// The Preview proxy currently drops CSP frame-ancestors. Keep this synchronous
// head script before all application scripts so an untrusted frame cannot render
// privileged controls; the server CSP still protects hosts that retain it.
(() => {
  if (window.top === window.self) return;
  const trusted = new Set(['https://manus.im', 'https://www.manus.im']);
  let ancestors = [];
  try {
    if (window.location.ancestorOrigins?.length) {
      ancestors = Array.from(window.location.ancestorOrigins);
    } else if (document.referrer) {
      ancestors = [new URL(document.referrer).origin];
    }
  } catch { /* An unavailable or invalid ancestor must fail closed. */ }
  if (ancestors.length && ancestors.every(value => trusted.has(value))) return;
  window.stop();
  document.documentElement.lang = 'en';
  document.documentElement.innerHTML = '<head><meta charset="utf-8"><title>Private review unavailable in this frame</title></head><body><p>Open the private review directly or through the Manus Dashboard.</p></body>';
})();
