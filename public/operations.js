(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const role = {value:null};
  const pages = {events:{value:1,size:12}, inbox:{value:1,size:12}, roles:{value:1,size:12}};
  let active = null;
  let eventItems = [], submissionItems = [], roleItems = [];
  const archiveOriginalResources = new Map();
  const eventFields = ['title','description','language','timezone','startsAt','location','onlineUrl','speaker','resourceUrl'];
  const errorCopy = {
    forbidden:'403: your verified role does not permit this action.', sign_in_required:'Sign in is required to continue.',
    invalid_event:'Check the required title, description, time, timezone, language and confirmed location or HTTPS link.',
    event_in_past:'This draft event has already started and cannot be published as an invitation.',
    archive_only:'A past published event can only receive a narrowly scoped authorised recording/resource update; all other published details must remain unchanged.',
    recording_rights_required:'Confirm that the newly supplied recording/resource link is authorised before publishing the archive update.',
    revision_conflict:'A newer event revision exists. Reload the selected event before trying again.',
    cancelled_event:'This event has been cancelled and cannot be changed.', invalid_transition:'This action is unavailable for the selected event state.',
    storage_unavailable:'The record store is temporarily unavailable. Please retry.', same_origin_required:'Reload this staff page before retrying the action.',
    invalid_role_change:'Use a valid verified account ID and a listed role. You cannot change your own owner access.',
    already_deleted:'This submission was already deleted. Refresh the Inbox to see its current state.',
  };

  function status(message, error = false) {
    $('status').textContent = message;
    $('status').className = error ? 'ops-status ops-error' : 'ops-status';
  }
  function message(error) {
    if (error.status === 403) return '403: your verified role does not permit this action.';
    if (error.status === 401) return 'Sign in is required to continue.';
    return errorCopy[error.code] || errorCopy[error.message] || 'The request could not be completed. Please retry.';
  }
  async function api(path, body) {
    let result;
    try {
      result = await fetch(path, {method:body === undefined ? 'GET' : 'POST', credentials:'same-origin', headers:body === undefined ? {Accept:'application/json'} : {'Content-Type':'application/json',Accept:'application/json'}, body:body === undefined ? undefined : JSON.stringify(body)});
    } catch { const error = new Error('network'); error.code = 'network'; error.status = 0; throw error; }
    const data = await result.json().catch(() => ({}));
    if (!result.ok) { const error = new Error(data.error || 'request_failed'); error.code = data.error || 'request_failed'; error.status = result.status; throw error; }
    return data;
  }
  function node(tag, text, className = '') {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function isPastPublished(event = active) {
    const startsAt = event?.current?.content?.startsAt;
    return Boolean(event?.published) && Number.isFinite(Date.parse(startsAt || '')) && Date.parse(startsAt) <= Date.now();
  }
  function setEvent(event) {
    active = event || null;
    const form = $('event-form');
    for (const field of eventFields) form.elements[field].value = event?.current?.content?.[field] || (field === 'timezone' ? 'Asia/Colombo' : field === 'language' ? 'en' : '');
    const writer = ['owner','publisher'].includes(role.value);
    const archive = isPastPublished(event);
    if (archive && event?.current?.state === 'published') archiveOriginalResources.set(event.id, event.current.content.resourceUrl || '');
    for (const field of eventFields) form.elements[field].disabled = !writer || Boolean(event?.cancelledAt) || (archive && field !== 'resourceUrl');
    $('new-event').disabled = !writer;
    $('event-state').textContent = event ? `${event.current.state} · revision ${event.head}${event.published ? ` · visitor revision ${event.published}` : ''}${archive ? ' · past published record' : ''}` : 'New draft';
    $('archive-recording-row').hidden = !archive;
    $('archive-recording-confirm').disabled = !writer || !archive || event?.current?.state !== 'draft';
    if (!archive) $('archive-recording-confirm').checked = false;
    $('save-event').disabled = !writer || Boolean(event?.cancelledAt);
    $('publish-event').disabled = !writer || !event || event.current.state !== 'draft' || Boolean(event.cancelledAt);
    $('cancel-event').disabled = !writer || !event || Boolean(event.cancelledAt);
  }
  function pageSlice(items, page) {
    const totalPages = Math.max(1, Math.ceil(items.length / page.size));
    page.value = Math.min(Math.max(page.value, 1), totalPages);
    const start = (page.value - 1) * page.size;
    return {shown:items.slice(start, start + page.size), start, totalPages};
  }
  function renderEventList() {
    const query = $('event-search').value.trim().toLocaleLowerCase();
    const wantedState = $('event-state-filter').value, wantedLanguage = $('event-language-filter').value;
    const matched = eventItems.filter(item => {
      const content = item.current?.content || {};
      const state = item.cancelledAt ? 'cancelled' : item.current?.state;
      return (!wantedState || state === wantedState) && (!wantedLanguage || content.language === wantedLanguage) &&
        (!query || [content.title,content.description,state].filter(Boolean).join('\n').toLocaleLowerCase().includes(query));
    });
    const result = pageSlice(matched, pages.events), host = $('event-list'); host.replaceChildren();
    if (!eventItems.length) host.append(node('p','No staff events are stored. Create a draft only when genuine details are confirmed.'));
    else if (!result.shown.length) host.append(node('p','No staff events match these filters.'));
    result.shown.forEach(item => {
      const button = node('button', `${item.current.content.title} · ${item.current.state} · r${item.head}${item.cancelledAt ? ' · cancelled' : ''}`, 'ops-record');
      button.type = 'button'; button.setAttribute('aria-current', String(active?.id === item.id));
      button.addEventListener('click', () => setEvent(item)); host.append(button);
    });
    $('event-count').textContent = eventItems.length ? `Showing ${result.shown.length ? result.start + 1 : 0}–${result.start + result.shown.length} of ${matched.length} matching event records from ${eventItems.length} returned by the server. The current API returns at most 200 records and has no server pages.` : 'The current API returns at most 200 records and has no server pages.';
    $('event-page').textContent = `Page ${pages.events.value} of ${result.totalPages}`; $('event-prev').disabled = pages.events.value <= 1; $('event-next').disabled = pages.events.value >= result.totalPages;
  }
  async function loadEvents() {
    try {
      const data = await api('/api/admin/events'); eventItems = Array.isArray(data.items) ? data.items : [];
      if (active) setEvent(eventItems.find(item => item.id === active.id) || null); else setEvent(null);
      renderEventList();
    } catch (error) { status(`Could not load staff events: ${message(error)}`, true); }
  }
  function eventPayload() {
    const submitted = Object.fromEntries(new FormData($('event-form')).entries());
    return Object.fromEntries(eventFields.map(field => {
      const raw = submitted[field] === undefined ? active?.current?.content?.[field] : submitted[field];
      const value = typeof raw === 'string' ? raw.trim() : raw;
      return [field, value || (field === 'language' ? 'en' : field === 'timezone' ? 'Asia/Colombo' : null)];
    }));
  }
  async function saveEvent(event) {
    event.preventDefault();
    if (!$('event-form').reportValidity()) return;
    const content = eventPayload();
    if (!content.location && !content.onlineUrl) return status('Supply a confirmed location or HTTPS online link.', true);
    if (isPastPublished() && !content.resourceUrl) return status('A past published event can only be updated with a newly supplied authorised HTTPS resource link.', true);
    if (isPastPublished() && archiveOriginalResources.get(active.id) === content.resourceUrl) return status('Supply a different new recording/resource link for this archived event. The server will also verify the narrow update.', true);
    try {
      active = active ? await api(`/api/admin/events/${active.id}/save`, {baseVersion:active.head,event:content}) : await api('/api/admin/events', {action:'create',event:content});
      status(isPastPublished() ? 'Archive recording update saved as a draft. Confirm rights before publishing; it is not a visitor invitation.' : 'Draft stored. It is not shown to visitors.');
      await loadEvents();
    } catch (error) { status(`Could not save: ${message(error)}`, true); }
  }
  async function actionEvent(action) {
    if (!active) return;
    const archive = action === 'publish' && isPastPublished();
    if (archive && !$('archive-recording-confirm').checked) return status('Confirm authorised recording/resource rights before publishing the archive update.', true);
    if (archive && !$('event-form').elements.resourceUrl.value.trim()) return status('Supply the new authorised HTTPS recording/resource link before publishing.', true);
    const prompt = action === 'publish' ? (archive ? 'Publish this narrowly scoped authorised recording/resource update? It will not create or change a visitor invitation.' : 'Confirm every future event detail is real and authorised, and publish to visitors?') : 'Cancel this event and remove its visitor invitation permanently?';
    if (!window.confirm(prompt)) return;
    try {
      const body = {baseVersion:active.head}; if (archive) body.authorizedRecording = true;
      active = await api(`/api/admin/events/${active.id}/${action}`, body);
      status(action === 'publish' ? (archive ? 'Authorised archive recording update published without changing the past event invitation.' : 'Confirmed future event published to the private review audience.') : 'Event cancelled and withdrawn from visitors.');
      await loadEvents();
    } catch (error) { status(`Could not ${action}: ${message(error)}`, true); }
  }
  function renderInbox() {
    const query = $('inbox-search').value.trim().toLocaleLowerCase(), kind = $('inbox-kind-filter').value, state = $('inbox-state-filter').value;
    const matched = submissionItems.filter(item => (!kind || item.kind === kind) && (!state || (state === 'deleted' ? item.deleted : !item.deleted)) && (!query || [item.kind,item.purpose,item.details].filter(Boolean).join('\n').toLocaleLowerCase().includes(query)));
    const result = pageSlice(matched, pages.inbox), host = $('submission-list'); host.replaceChildren();
    if (!submissionItems.length) host.append(node('p','No visitor submissions are stored.'));
    else if (!result.shown.length) host.append(node('p','No private intake records match these filters.'));
    result.shown.forEach(item => {
      const card = node('article','', 'ops-submission'); card.append(node('strong', `${item.kind} · ${item.purpose} · ${new Date(item.createdAt).toLocaleString()}`));
      if (item.deleted) card.append(node('p','Contact and message deleted; audit tombstone retained.'));
      else {
        card.append(node('p',item.details || 'No message supplied.'));
        if (item.contact) card.append(node('p',`Contact (${item.contactPreference}): ${item.contact}`));
        const button = node('button','Delete contact and message'); button.type='button';
        button.addEventListener('click', async () => {
          if (!window.confirm('Permanently clear this submission’s contact and message? The payload-free audit record remains.')) return;
          try { await api(`/api/admin/submissions/${item.id}/delete`,{}); status('Submission contact and message removed.'); await loadSubmissions(); }
          catch (error) { status(`Could not delete: ${message(error)}`, true); }
        }); card.append(button);
      } host.append(card);
    });
    $('inbox-count').textContent = submissionItems.length ? `Showing ${result.shown.length ? result.start + 1 : 0}–${result.start + result.shown.length} of ${matched.length} matching records from ${submissionItems.length} returned by the server. The current API returns at most 200 records and has no server pages.` : 'The current API returns at most 200 records and has no server pages.';
    $('inbox-page').textContent = `Page ${pages.inbox.value} of ${result.totalPages}`; $('inbox-prev').disabled = pages.inbox.value <= 1; $('inbox-next').disabled = pages.inbox.value >= result.totalPages;
  }
  async function loadSubmissions() {
    try { const data = await api('/api/admin/submissions'); submissionItems = Array.isArray(data.items) ? data.items : []; pages.inbox.value = 1; renderInbox(); }
    catch (error) { status(`Could not load private intake: ${message(error)}`, true); }
  }
  function renderRoles() {
    const query = $('role-search').value.trim().toLocaleLowerCase(), state = $('role-state-filter').value;
    const matched = roleItems.filter(item => (!state || (state === 'revoked' ? item.disabled : !item.disabled && item.role === state)) && (!query || [item.user_id,item.role,item.disabled ? 'revoked' : ''].join('\n').toLocaleLowerCase().includes(query)));
    const result = pageSlice(matched, pages.roles), host = $('role-list'); host.replaceChildren();
    if (!roleItems.length) host.append(node('p','No additional account roles are assigned.'));
    else if (!result.shown.length) host.append(node('p','No verified-account roles match these filters.'));
    result.shown.forEach(item => host.append(node('p', `${item.user_id} · ${item.disabled ? 'revoked' : item.role} · ${item.updated_at}`)));
    $('role-count').textContent = roleItems.length ? `Showing ${result.shown.length ? result.start + 1 : 0}–${result.start + result.shown.length} of ${matched.length} matching role records from ${roleItems.length} returned by the server. The current API returns at most 100 records and has no server pages.` : 'The current API returns at most 100 records and has no server pages.';
    $('role-page').textContent = `Page ${pages.roles.value} of ${result.totalPages}`; $('role-prev').disabled = pages.roles.value <= 1; $('role-next').disabled = pages.roles.value >= result.totalPages;
  }
  async function loadRoles() {
    try { const data = await api('/api/admin/roles'); roleItems = Array.isArray(data.items) ? data.items : []; pages.roles.value = 1; renderRoles(); }
    catch (error) { status(`Could not load account roles: ${message(error)}`, true); }
  }
  async function init() {
    try {
      const session = await api('/api/review/session'); role.value = session.user?.role || null;
      $('access').textContent = `Verified role: ${role.value || 'unavailable'}`;
      if (['owner','publisher','reviewer'].includes(role.value)) { $('event-section').hidden = false; setEvent(null); await loadEvents(); }
      if (role.value === 'owner') { $('inbox-section').hidden = false; $('roles-section').hidden = false; await Promise.all([loadSubmissions(),loadRoles()]); }
      if (!['owner','publisher','reviewer'].includes(role.value)) status('403: this account has no staff permissions. Ask the owner to assign an appropriate verified role.', true);
    } catch (error) { $('access').textContent = 'Sign in is required to view this private workspace.'; status(`Staff data is not available: ${message(error)}`, true); }
  }
  $('new-event').addEventListener('click',() => setEvent(null));
  $('event-form').addEventListener('submit',saveEvent); $('publish-event').addEventListener('click',() => actionEvent('publish')); $('cancel-event').addEventListener('click',() => actionEvent('cancel'));
  [['event-search','input'],['event-state-filter','change'],['event-language-filter','change']].forEach(([id,type]) => $(id).addEventListener(type, () => { pages.events.value = 1; renderEventList(); }));
  $('event-prev').addEventListener('click', () => { pages.events.value--; renderEventList(); }); $('event-next').addEventListener('click', () => { pages.events.value++; renderEventList(); });
  $('refresh-inbox').addEventListener('click',loadSubmissions);
  [['inbox-search','input'],['inbox-kind-filter','change'],['inbox-state-filter','change']].forEach(([id,type]) => $(id).addEventListener(type, () => { pages.inbox.value = 1; renderInbox(); }));
  $('inbox-prev').addEventListener('click', () => { pages.inbox.value--; renderInbox(); }); $('inbox-next').addEventListener('click', () => { pages.inbox.value++; renderInbox(); });
  [['role-search','input'],['role-state-filter','change']].forEach(([id,type]) => $(id).addEventListener(type, () => { pages.roles.value = 1; renderRoles(); }));
  $('role-prev').addEventListener('click', () => { pages.roles.value--; renderRoles(); }); $('role-next').addEventListener('click', () => { pages.roles.value++; renderRoles(); });
  $('role-form').addEventListener('submit',async event => {
    event.preventDefault(); if (!$('role-form').reportValidity()) return;
    const input = Object.fromEntries(new FormData($('role-form')).entries());
    if (!window.confirm(`${input.role === 'revoke' ? 'Revoke' : `Grant ${input.role} to`} exact account ${input.userId}?`)) return;
    try { await api('/api/admin/roles',input); $('role-form').reset(); status('Role change saved; access is re-evaluated on each request.'); await loadRoles(); }
    catch (error) { status(`Could not change role: ${message(error)}`, true); }
  });
  init();
})();
