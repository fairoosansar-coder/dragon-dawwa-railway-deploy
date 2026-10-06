// These public legal notices contain no account, staff, or operational data.
const origin = 'https://dragondawwa.org';
const head = title => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><meta name="description" content="${title} for Dragon Dawwa."><link rel="canonical" href="${origin}/${title === 'Privacy' ? 'privacy' : 'terms'}"><meta property="og:type" content="website"><meta property="og:title" content="${title} · Dragon Dawwa"><meta property="og:url" content="${origin}/${title === 'Privacy' ? 'privacy' : 'terms'}"><meta property="og:site_name" content="Dragon Dawwa"><title>${title} · Dragon Dawwa</title><style>body{font:1.05rem/1.65 system-ui,-apple-system,sans-serif;color:#173f35;background:#f7f5ed;margin:0}main{max-width:48rem;margin:auto;padding:2rem 1.25rem 4rem}h1,h2{line-height:1.24}h1{font-size:2.1rem}h2{margin-top:2rem;font-size:1.25rem}a{color:#0c5b49}a:focus-visible{outline:3px solid #a86e20;outline-offset:4px}nav{display:flex;gap:1.2rem;flex-wrap:wrap}small{color:#4e6059}</style></head><body><main><p><strong>DRAGON DAWWA</strong></p><nav aria-label="Site navigation"><a href="/">Home</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a><a href="/login">Member sign in</a></nav>`;
const footer = '<hr><p><small>Public browsing does not create an account or grant access to protected member, staff, review, study, or operational areas.</small></p></main></body></html>';

const privacy = `<h1>Privacy and data use</h1>
<p>Dragon Dawwa’s visitor-facing pages can be read without an account. Contact the owner at <a href="mailto:ferozansarlk@gmail.com">ferozansarlk@gmail.com</a> about this notice or protected-account access.</p>
<h2>Public pages and external sources</h2>
<p>Public pages may link to original publishers, government directory records, Quran Foundation content, Quran.com, and recitation delivery services. Their own privacy terms apply. External-resource links are not rehosted lessons or endorsements. The Quran reader is unavailable when its provider credentials or service are unavailable; the site does not substitute invented content.</p>
<h2>Protected accounts and invitations</h2>
<p>Member, staff, editorial-review, personal study, saved-item, and operational areas require a current, server-side invitation and role. Google sign-in requests only <code>openid email profile</code>. The server verifies the identity provider response and matches an opaque account reference to an existing server-side role; email is checked for validity but is not used as an invitation key. A sign-in alone does not create a Dragon Dawwa account or grant access. Dragon Dawwa does not store Google passwords or provider access/refresh tokens.</p>
<h2>Private records and security</h2>
<p>For invited members, signed browser sessions are checked against current server-side roles and revocation records. Private profiles, saved items, reading positions, study history, reports, and staff/audit records are not published through visitor pages. The service uses encrypted transport and access controls, but no internet service can guarantee zero risk. Do not submit passwords, payment details, exact private addresses, or another person’s private information through any service channel.</p>
<h2>Retention and deletion</h2>
<p>Protected-account records are governed by the account controls and applicable notices shown inside the authenticated service. Public browsing does not store a member profile or enrol a visitor. Backup and retention controls are operated separately and are not represented as a public-content feature.</p>`;

const terms = `<h1>Terms and source use</h1>
<p>Dragon Dawwa publishes only the visitor-facing pages and content made available through its public routes. Browsing does not create a membership, invitation, staff role, learning history, or entitlement to protected services. Contact <a href="mailto:ferozansarlk@gmail.com">ferozansarlk@gmail.com</a> about access.</p>
<h2>Sources and interpretation</h2>
<p>Arabic Quran text, translations, recitations, government directory records, published editorial readings, and external publisher resources remain subject to their respective sources and rights. A translation conveys an interpretation of meaning, not the Arabic Quran itself. Directory listings are not proof of present contact details, mosque affiliation, ownership, membership, partnership, or endorsement.</p>
<h2>Published status</h2>
<p>Only content returned through published visitor routes is presented as public content. Drafts, review history, internal notes, cancelled events, account records, and staff operations are not public. An empty events or library view means no matching published item is available; it is not a promise that a gathering, speaker, lesson, or translation exists.</p>
<h2>Responsible use</h2>
<p>Content is offered for careful learning and source-following. It is not a personal fatwa, medical, legal, safety, or other professional instruction. Do not manufacture attribution, claim an external source endorses Dragon Dawwa, submit another person’s private data, or attempt to access protected routes. Source services can be unavailable; unavailable content is not replaced with invented material.</p>`;

export function publicPolicyPage(pathname, method = 'GET') {
  const selected = pathname === '/privacy' ? ['Privacy', privacy] : pathname === '/terms' ? ['Terms', terms] : null;
  if (!selected) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { 'Cache-Control': 'no-store' } });
  const html = head(selected[0]) + selected[1] + footer;
  return new Response(method === 'HEAD' ? null : html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', 'X-DD-Public-Page': '1' },
  });
}
