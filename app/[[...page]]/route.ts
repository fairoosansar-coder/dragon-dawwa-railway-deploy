import home from '../../public/index.html?raw';
import research from '../../public/research.html?raw';
import quran from '../../public/quran.html?raw';
import administration from '../../public/admin.html?raw';
import operations from '../../public/operations.html?raw';
import library from '../../public/library.html?raw';
import mosque from '../../public/mosque.html?raw';
import events from '../../public/events.html?raw';
import about from '../../public/about.html?raw';
import participate from '../../public/participate.html?raw';
import resources from '../../public/resources.html?raw';
import member from '../../public/member.html?raw';
import staff from '../../public/staff.html?raw';
import recovery from '../../public/recovery.html?raw';
import signedOut from '../../public/signed-out.html?raw';
import study from '../../public/study.html?raw';
import mosques from '../../public/mosques.html?raw';
import privacy from '../../public/privacy.html?raw';
import terms from '../../public/terms.html?raw';
import sources from '../../public/sources.html?raw';
import accessibility from '../../public/accessibility.html?raw';

export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  const url = new URL(request.url);
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
    return Response.redirect(url, 308);
  }
  const pages: Record<string, string> = {
    '/': home, '/index.html': home,
    '/research': research, '/research.html': research,
    '/quran': quran, '/quran.html': quran,
    '/study': study, '/study.html': study,
    '/learn': library, '/library': library, '/library.html': library,
    '/resources': resources, '/resources.html': resources,
    '/member': member, '/member.html': member,
    '/staff': staff, '/staff.html': staff,
    '/recover': recovery, '/signed-out': signedOut,
    '/admin': administration, '/admin.html': administration,
    '/operations': operations, '/operations.html': operations,
    '/mosque': mosque, '/mosque.html': mosque,
    '/mosques': mosques, '/mosques.html': mosques,
    '/events': events, '/events.html': events,
    '/about': about, '/about.html': about,
    '/contact': participate, '/participate': participate, '/participate.html': participate,
    '/privacy': privacy, '/terms': terms, '/sources': sources, '/accessibility': accessibility,
  };
  const content = pages[url.pathname] ||
    (/^\/library\/[a-zA-Z0-9-]{1,64}$/.test(url.pathname) ? library : null) ||
    (/^\/mosques\/[a-zA-Z0-9-]{1,64}$/.test(url.pathname) ? mosques : null) ||
    (/^\/events\/[a-zA-Z0-9-]{1,64}$/.test(url.pathname) ? events : null);
  return new Response(content || '<!doctype html><title>Not found · Dragon Dawwa</title><h1>Page not found</h1><a href="/">Return home</a>', {
    status: content ? 200 : 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
