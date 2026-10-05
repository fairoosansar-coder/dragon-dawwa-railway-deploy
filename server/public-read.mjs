// This is an application-side policy for a separately approved future launch.
// It is not activated by making the Webdev project or a URL publicly visible.
const pages = new Set([
  '/', '/index.html', '/about', '/about.html', '/quran', '/quran.html',
  '/learn', '/library', '/library.html',
  '/resources', '/resources.html', '/research', '/research.html',
  '/mosque', '/mosque.html', '/mosques', '/mosques.html',
  '/events', '/events.html',
  '/privacy', '/terms', '/sources', '/accessibility',
]);
const readApis = new Set([
  '/api/content', '/api/events', '/api/quran/bootstrap',
  '/api/quran/verses', '/api/resources', '/api/mosques',
]);
const safeAsset = /^(?:\/(?:assets|data)\/[a-zA-Z0-9_.\/-]+|\/[a-zA-Z0-9_-]+\.(?:js|css|svg|png))$/;

export function publicReadingAllowed(method, pathname, config) {
  if (config.DD_PUBLIC_READ_MODE !== 'approved-public-readonly') return false;
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (pages.has(pathname) || safeAsset.test(pathname) && !pathname.includes('..')) return true;
  if (method !== 'GET') return false;
  return readApis.has(pathname) || /^\/api\/content\/[a-zA-Z0-9-]{1,64}$/.test(pathname) ||
    /^\/library\/[a-zA-Z0-9-]{1,64}$/.test(pathname) ||
    /^\/mosques\/[1-9][0-9]{0,3}$/.test(pathname) ||
    /^\/events\/[a-zA-Z0-9-]{1,64}$/.test(pathname);
}
