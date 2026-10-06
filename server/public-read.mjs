// Public website access is deliberately narrow: only approved visitor pages, their
// required assets, and read-only published-data endpoints are reachable without a
// session. It never expands the member, staff, review, study, or operational API.
const PUBLIC_ORIGIN = 'https://dragondawwa.org';
const pages = new Set([
  '/', '/index.html', '/about', '/about.html', '/quran', '/quran.html', '/quran/study',
  '/learn', '/library', '/library.html', '/resources', '/resources.html',
  '/research', '/research.html', '/mosque', '/mosque.html', '/mosques', '/mosques.html',
  '/events', '/events.html', '/participate', '/participate.html', '/contact',
  '/privacy', '/terms', '/sources', '/accessibility',
]);
const readApis = new Set([
  '/api/content', '/api/events', '/api/quran/bootstrap',
  '/api/quran/verses', '/api/quran/ayah', '/api/quran/chapter', '/api/quran/chapter-audio', '/api/quran/navigate', '/api/resources', '/api/mosques',
]);
const publicAssets = new Set([
  '/assets/mark.svg', '/assets/garden-arch.png',
  '/styles.css', '/community.css', '/editorial.css', '/mosques.css', '/quran.css', '/research.css', '/resources.css',
  '/app.js', '/home-review-copy.js', '/shared-nav.js', '/pages.js', '/library.js', '/mosques.js',
  '/quran.js', '/quran-copy.js', '/quran-study.js', '/research.js', '/research-copy.js', '/resources.js', '/frame-guard.js',
  '/data/mosques-anuradhapura.json', '/data/population.json', '/data/provenance.json',
]);

export function publicReadEnabled(config = {}) {
  if (config.DD_PUBLIC_READ_MODE === 'private') return false;
  if (config.DD_PUBLIC_READ_MODE === 'approved-public-readonly') return true;
  // This release is intentionally bound to the approved canonical public origin.
  // Other Railway hosts and non-production configurations remain private by default.
  return config.AUTH_PROVIDER === 'google-oidc' && config.REVIEW_PUBLIC_ORIGIN === PUBLIC_ORIGIN;
}

export function publicReadingAllowed(method, pathname, config = {}) {
  if (!publicReadEnabled(config) || (method !== 'GET' && method !== 'HEAD')) return false;
  if (pages.has(pathname) || publicAssets.has(pathname)) return true;
  if (method !== 'GET') return false;
  return readApis.has(pathname) || /^\/api\/content\/[a-zA-Z0-9-]{1,64}$/.test(pathname) ||
    /^\/library\/[a-zA-Z0-9-]{1,64}$/.test(pathname) ||
    /^\/mosques\/[1-9][0-9]{0,3}$/.test(pathname) ||
    /^\/events\/[a-zA-Z0-9-]{1,64}$/.test(pathname);
}
