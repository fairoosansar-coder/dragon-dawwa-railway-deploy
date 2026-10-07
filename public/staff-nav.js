(() => {
  'use strict';

  const staffRoles = new Set(['owner', 'author', 'reviewer', 'publisher']);
  const entries = [
    {key:'dashboard', label:'Dashboard', href:'/staff', roles:staffRoles},
    {key:'content', label:'Content', href:'/admin', roles:staffRoles},
    {key:'reviews', label:'Reviews', href:'/admin#review-panel', roles:new Set(['owner', 'reviewer', 'publisher'])},
    {key:'events', label:'Events', href:'/operations#event-section', roles:new Set(['owner', 'reviewer', 'publisher'])},
    {key:'mosques', label:'Mosques', href:'/staff#mosques', roles:staffRoles},
    {key:'members', label:'Members', href:'/staff#members', roles:new Set(['owner'])},
    {key:'team', label:'Team', href:'/operations#roles-section', roles:new Set(['owner'])},
    {key:'inbox', label:'Inbox', href:'/operations#inbox-section', roles:new Set(['owner'])},
    {key:'audit', label:'Audit History', href:'/staff#audit', roles:staffRoles},
    {key:'study', label:'Study / audio', href:'/staff#study-ops', roles:new Set(['owner'])},
    {key:'hadith', label:'Hadith reports', href:'/hadith-reports', roles:new Set(['owner','author','reviewer'])},
    {key:'podcasts', label:'Podcast production', href:'/podcast-production', roles:new Set(['owner','reviewer','publisher'])},
    {key:'settings', label:'Settings', href:'/staff#settings', roles:staffRoles},
  ];

  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  function signOutForm(proof) {
    const form = make('form', undefined, 'staff-nav-logout');
    form.method = 'post';
    form.action = '/auth/logout';
    if (proof) {
      const input = make('input');
      input.type = 'hidden'; input.name = 'logout_csrf'; input.value = proof;
      form.append(input);
    }
    const button = make('button', 'Sign out', 'staff-nav-signout');
    button.type = 'submit';
    form.append(button);
    return form;
  }
  function errorText(status) {
    if (status === 401) return 'Sign in is required for staff navigation.';
    if (status === 403) return '403: this verified account does not have a staff role.';
    return 'Staff navigation is temporarily unavailable.';
  }
  async function session() {
    let response;
    try { response = await fetch('/api/review/session', {credentials:'same-origin', headers:{Accept:'application/json'}}); }
    catch { return {role:null, message:errorText(0)}; }
    if (!response.ok) return {role:null, message:errorText(response.status)};
    const data = await response.json().catch(() => ({}));
    const role = data.user?.role || null;
    const proof = data.logoutCsrfToken;
    if (Object.hasOwn(data, 'logoutCsrfToken') && !/^[A-Za-z0-9_-]{43}$/.test(proof || ''))
      return {role:null, message:'Staff sign-out is temporarily unavailable.'};
    return {role, proof, message:staffRoles.has(role) ? `Verified staff role: ${role}.` : '403: your verified access does not include a staff role.'};
  }
  function render(host, role, message, index, proof = null) {
    host.replaceChildren();
    const shell = make('div', undefined, 'staff-nav');
    const label = make('p', message, 'staff-nav-access');
    label.setAttribute('role', 'status');
    shell.append(label);
    if (!staffRoles.has(role)) {
      if (message !== 'Checking staff access…') shell.append(signOutForm(proof));
      host.append(shell);
      return;
    }
    const nav = make('nav', undefined, 'staff-nav-links');
    nav.setAttribute('aria-label', 'Staff navigation');
    const menuId = `staff-nav-menu-${index}`;
    const toggle = make('button', 'Staff areas', 'staff-nav-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', menuId);
    toggle.setAttribute('aria-expanded', 'false');
    const menu = make('div', undefined, 'staff-nav-menu');
    menu.id = menuId;
    menu.hidden = true;
    const current = host.dataset.staffPage || '';
    entries.filter(entry => entry.roles.has(role)).forEach(entry => {
      const link = make('a', entry.label);
      link.href = entry.href;
      if (entry.key === current || (current === 'operations' && ['events', 'team', 'inbox'].includes(entry.key))) link.setAttribute('aria-current', 'page');
      menu.append(link);
    });
    const site = make('a', 'View site');
    site.href = '/';
    menu.append(site);
    menu.append(signOutForm(proof));
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Close staff areas' : 'Staff areas';
      menu.hidden = !open;
    });
    nav.append(toggle, menu);
    shell.append(nav);
    host.append(shell);
  }

  const hosts = [...document.querySelectorAll('[data-staff-nav]')];
  hosts.forEach((host, index) => render(host, null, 'Checking staff access…', index));
  session().then(({role, message, proof}) => hosts.forEach((host, index) => render(host, role, message, index, proof)));
})();
