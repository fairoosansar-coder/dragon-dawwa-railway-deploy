(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const staffRoles = new Set(['owner', 'author', 'reviewer', 'publisher']);
  const curationRoles = new Set(['owner', 'publisher']);
  const correctionWriteRoles = new Set(['owner', 'publisher', 'reviewer']);
  let role = null;
  const state = {
    members: {page: 1, hasMore: false}, resources: {page: 1, hasMore: false},
    corrections: {page: 1, hasMore: false}, intake: {page: 1, hasMore: false}, audit: {page: 1, hasMore: false}, studyReports: {page: 1, hasMore: false},
  };

  const make = (tag, content, className) => {
    const element = document.createElement(tag);
    if (content !== undefined) element.textContent = String(content);
    if (className) element.className = className;
    return element;
  };
  const dates = value => {
    if (!value) return 'No time recorded';
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
  };
  const errorMessage = error => {
    const code = error?.message || 'request_failed';
    const copy = {
      sign_in_required: 'Sign in is required.', forbidden: '403: this action is restricted to your verified role.',
      same_origin_required: 'This action must be submitted from the private staff site.', revision_conflict: 'This record changed. Reload it before saving.',
      link_verification_required: 'A reviewed resource needs a verified link check.', resource_archived: 'Restore this resource before editing it.',
      archive_confirmation_required: 'The required archive or restore confirmation was not provided.',
      apply_confirmation_required: 'Confirm that you are applying a community overlay, not changing government data.',
      invalid_assignee: 'The assignee must be an active verified staff account.',
      redaction_confirmation_required: 'Confirm redaction before clearing stored payload fields.', already_redacted: 'This submission was already redacted.',
      retention_dry_run_only: 'Retention remains count-only: dry run must be true and automatic purge false.',
      storage_unavailable: 'The private record store is temporarily unavailable. Please retry.',
    };
    return copy[code] || `The action could not be completed (${code}).`;
  };
  const set = (id, message, error = false) => {
    const element = $(id); if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', error);
  };
  async function api(path, options = {}) {
    const init = {credentials: 'same-origin', headers: {Accept: 'application/json'}, ...options};
    if (options.body !== undefined) {
      init.headers = {...init.headers, 'Content-Type': 'application/json'};
      init.body = JSON.stringify(options.body);
    }
    let response;
    try { response = await fetch(path, init); } catch { const error = new Error('network'); error.status = 0; throw error; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || 'request_failed'); error.status = response.status; throw error; }
    return data;
  }
  const post = (path, body) => api(path, {method: 'POST', body});
  function setPage(name, prefix) {
    const current = state[name];
    $(`${prefix}-page`).textContent = `Page ${current.page}`;
    $(`${prefix}-prev`).disabled = current.page <= 1;
    $(`${prefix}-next`).disabled = !current.hasMore;
  }
  function bindPage(name, prefix, loader) {
    $(`${prefix}-prev`).addEventListener('click', () => { if (state[name].page > 1) loader(state[name].page - 1); });
    $(`${prefix}-next`).addEventListener('click', () => { if (state[name].hasMore) loader(state[name].page + 1); });
  }
  function roleVisibility() {
    const owner = role === 'owner';
    const curator = curationRoles.has(role);
    const correctionWriter = correctionWriteRoles.has(role);
    document.querySelectorAll('[data-owner-only]').forEach(node => { node.hidden = !owner; });
    document.querySelectorAll('[data-curation-only]').forEach(node => { node.hidden = !curator; });
    document.querySelectorAll('[data-correction-write]').forEach(node => { node.hidden = !correctionWriter; });
    document.querySelectorAll('[data-staff-roles]').forEach(node => { node.hidden = !node.dataset.staffRoles.split(/\s+/).includes(role); });
    $('staff-owner-note').hidden = owner;
  }

  function renderDashboard(data) {
    const labels = {activeReviewedResources: 'Active reviewed resources', resourceReviewQueue: 'Resource review queue', mosqueReviewQueue: 'Mosque review queue', intakeQueue: 'Open intake queue', studyReportQueue: 'AI report queue', audioJobsAwaitingAttention: 'Audio jobs awaiting attention', registeredMembers: 'Registered members'};
    const counts = $('dashboard-counts'); counts.replaceChildren();
    Object.entries(labels).forEach(([key, label]) => {
      const group = make('div'); group.append(make('dt', label), make('dd', Number(data.counts?.[key] || 0))); counts.append(group);
    });
    const integrations = $('dashboard-integrations'); integrations.replaceChildren();
    Object.entries(data.integrations || {}).forEach(([key, value]) => { integrations.append(make('dt', key.replace(/([A-Z])/g, ' $1')), make('dd', value)); });
    const activity = $('dashboard-activity'); activity.replaceChildren();
    const items = Array.isArray(data.recentActivity) ? data.recentActivity : [];
    if (!items.length) activity.append(make('p', 'No authorised management activity is recorded yet.', 'editorial-note'));
    items.forEach(item => {
      const card = make('article', undefined, 'staff-record');
      card.append(make('strong', `${item.action} · ${item.targetType}`), make('p', `Target: ${item.targetId}`, 'staff-record-facts'));
      const time = make('time', `${item.actorId} · ${dates(item.createdAt)}`); time.dateTime = item.createdAt || ''; card.append(time); activity.append(card);
    });
  }
  async function loadDashboard() {
    set('dashboard-state', 'Loading live management counts…');
    try { const data = await api('/api/admin/dashboard'); renderDashboard(data); set('dashboard-state', 'Counts and queue states are returned by the server.'); }
    catch (error) { $('dashboard-counts').replaceChildren(); $('dashboard-activity').replaceChildren(); set('dashboard-state', errorMessage(error), true); }
  }

  async function loadStudyOperations() {
    set('study-ops-state', 'Checking server-side study counters…');
    try {
      const data = await api('/api/admin/study-usage');
      const host = $('study-ops-counts'); host.replaceChildren();
      const metrics = {
        'Day (UTC)':data.day,
        'Gemini study requests':data.usage?.studyRequests,
        'Gemini narration requests':data.usage?.speechRequests,
        'Transcription requests':data.usage?.transcriptionRequests,
        'Speech characters':data.usage?.speechCharacters,
        'Queued audio jobs':data.audioJobs?.queued || 0,
        'Processing audio jobs':data.audioJobs?.processing || 0,
        'Failed audio jobs':data.audioJobs?.failed || 0,
        'Open AI answer reports':data.openReports,
        'Text model':data.modelIds?.text,
        'Speech model':data.modelIds?.speech,
        'Narration voice':data.modelIds?.voice,
        'Private generation':data.providerEnabled ? 'Enabled within owner and environment caps' : 'Disabled',
      };
      for (const [label, value] of Object.entries(metrics)) { const group=make('div'); group.append(make('dt', label),make('dd', value ?? 'Unavailable')); host.append(group); }
      set('study-ops-state', 'Counters are private, server-derived and request/character bounded; there is no verified currency cap.');
    } catch(error) { $('study-ops-counts').replaceChildren();set('study-ops-state', errorMessage(error), true); }
  }

  async function loadPodcastOperations() {
    set('podcast-ops-state', 'Checking podcast foundation controls…');
    try {
      const data = await api('/api/admin/podcast/availability');
      const host = $('podcast-ops-counts'); host.replaceChildren();
      const metrics = {
        'Podcast rendering': data.enabled ? 'Available' : 'Disabled',
        'Render mode': data.renderMode || 'disabled',
        'Current blocker': data.reason || 'foundation_not_wired',
        'Hadith report adapter': data.reportAdapterConnected ? 'Connected' : 'Not connected',
        'Private audio storage': data.privateStorageApproved ? 'Approved' : 'Pending owner decision',
        'ffmpeg worker': data.ffmpegWorkerApproved ? 'Approved' : 'Not approved',
        'Daily credit cap': data.dailyCreditCapConfigured ? 'Configured' : 'Not configured',
      };
      for (const [label, value] of Object.entries(metrics)) { const group = make('div'); group.append(make('dt', label), make('dd', value)); host.append(group); }
      set('podcast-ops-state', data.message || 'No rendering or media delivery action is exposed by this panel.');
    } catch (error) { $('podcast-ops-counts').replaceChildren(); set('podcast-ops-state', errorMessage(error), true); }
  }

  async function loadStudyReports(page = 1) {
    const params=new URLSearchParams({page:String(page),status:$('study-reports-status').value});
    set('study-reports-state','Loading bounded report metadata…');
    try {
      const data=await api(`/api/admin/study-reports?${params}`);
      state.studyReports.page=data.page||page; state.studyReports.hasMore=data.hasMore===true;
      setPage('studyReports','study-reports');
      const host=$('study-reports-list');host.replaceChildren();
      if (!data.items?.length) host.append(make('p','No reported study answers match this filter.','editorial-note'));
      for (const item of data.items||[]) {
        const card=make('article',undefined,'staff-record');card.append(make('h3',`${item.reason} · ${item.status}`));
        card.append(make('p',item.details||'No additional detail supplied.','staff-record-facts'));
        const time=make('time',dates(item.createdAt));time.dateTime=item.createdAt||'';card.append(time);
        const button=make('button',item.status==='open'?'Mark reviewed':'Reopen report');button.type='button';
        button.addEventListener('click',async()=>{
          button.disabled=true;
          try { await post(`/api/admin/study-reports/${encodeURIComponent(item.id)}`,{action:item.status==='open'?'resolve':'reopen'});await Promise.all([loadStudyReports(state.studyReports.page),loadStudyOperations(),loadDashboard()]);set('study-reports-state','Report state changed with an append-only audit event.'); }
          catch(error){set('study-reports-state',errorMessage(error),true);button.disabled=false;}
        });
        card.append(button);host.append(card);
      }
      set('study-reports-state',`Showing ${data.items?.length||0} of ${data.total??0} server-paginated reports; no member question or answer is displayed.`);
    } catch(error){state.studyReports.hasMore=false;setPage('studyReports','study-reports');$('study-reports-list').replaceChildren();set('study-reports-state',errorMessage(error),true);}
  }

  function resourceInput() {
    const languages = $('resource-languages').value.split(',').map(value => value.trim()).filter(Boolean);
    return {
      title: $('resource-title').value, publisher: $('resource-publisher').value, publisherUrl: $('resource-publisher-url').value,
      url: $('resource-url').value, summary: $('resource-summary').value, category: $('resource-category').value,
      languages, format: $('resource-format').value, rightsNote: $('resource-rights-note').value,
      lastCheckedOn: $('resource-last-checked').value, linkStatus: $('resource-link-status').value,
      reviewState: $('resource-review-state').value, status: 'active',
    };
  }
  function clearResourceForm() {
    $('resource-form').reset(); $('resource-record-id').value = ''; $('resource-seed-key').value = ''; $('resource-base-version').value = '';
    $('resource-editor-title').textContent = 'Add managed resource'; $('resource-archive').hidden = true; $('resource-restore').hidden = true;
    set('resource-form-state', '');
  }
  function populateResource(item, version = '') {
    $('resource-record-id').value = item.recordId || ''; $('resource-seed-key').value = item.recordId ? '' : (item.seedKey || item.id || ''); $('resource-base-version').value = version || '';
    $('resource-title').value = item.title || ''; $('resource-publisher').value = item.publisher || ''; $('resource-publisher-url').value = item.publisherUrl || '';
    $('resource-url').value = item.url || ''; $('resource-summary').value = item.summary || ''; $('resource-category').value = item.category || 'Getting started with Quran study';
    $('resource-languages').value = (item.languages || []).join(', '); $('resource-format').value = item.format || ''; $('resource-rights-note').value = item.rightsNote || '';
    $('resource-last-checked').value = item.lastCheckedOn || ''; $('resource-link-status').value = item.linkStatus || 'unchecked'; $('resource-review-state').value = item.reviewState || 'draft';
    $('resource-editor-title').textContent = item.recordId ? `Edit resource: ${item.title}` : `Create managed override: ${item.title}`;
    $('resource-archive').hidden = !item.recordId || item.status === 'archived'; $('resource-restore').hidden = !item.recordId || item.status !== 'archived';
    $('resource-editor').open = true; $('resource-editor').scrollIntoView({block: 'nearest'});
  }
  async function editResource(item) {
    try {
      if (item.recordId) { const detail = await api(`/api/admin/resources/${encodeURIComponent(item.recordId)}`); populateResource(detail.resource, detail.version); }
      else populateResource(item);
      set('resource-form-state', '');
    } catch (error) { set('resource-manager-state', errorMessage(error), true); }
  }
  function renderResources(items) {
    const host = $('resource-manager-list'); host.replaceChildren();
    if (!items.length) host.append(make('p', 'No managed or primary-publisher resource matches these filters.', 'editorial-note'));
    items.forEach(item => {
      const card = make('article', undefined, 'staff-record');
      card.append(make('h3', item.title || 'Untitled resource'));
      card.append(make('p', `${item.publisher} · ${item.format} · ${(item.languages || []).join(', ')}`, 'staff-record-facts'));
      card.append(make('p', `${item.source === 'primary_publisher_seed' ? 'Primary-publisher seed' : 'Managed record'} · ${item.status} · ${item.reviewState} · link: ${item.linkStatus}`, 'staff-record-facts'));
      if (curationRoles.has(role)) { const actions = make('div', undefined, 'staff-record-actions'); const edit = make('button', item.recordId ? 'Edit' : 'Create editable override'); edit.type = 'button'; edit.addEventListener('click', () => editResource(item)); actions.append(edit); card.append(actions); }
      host.append(card);
    });
  }
  async function loadResources(page = 1) {
    const params = new URLSearchParams({page: String(page)});
    const q = $('resource-search').value.trim(), status = $('resource-status-filter').value, review = $('resource-review-filter').value;
    if (q) params.set('q', q); if (status) params.set('status', status); if (review) params.set('review', review);
    set('resource-manager-state', 'Loading resources…');
    try { const data = await api(`/api/admin/resources?${params}`); state.resources.page = data.page || page; state.resources.hasMore = data.hasMore === true; renderResources(data.items || []); setPage('resources', 'resource'); set('resource-manager-state', `Showing ${data.items?.length || 0} of ${data.total ?? 0} server-paginated resource records.`); }
    catch (error) { state.resources.hasMore = false; setPage('resources', 'resource'); $('resource-manager-list').replaceChildren(); set('resource-manager-state', errorMessage(error), true); }
  }
  async function submitResource(event) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) { event.currentTarget.reportValidity(); return; }
    const id = $('resource-record-id').value;
    set('resource-form-state', 'Saving resource…');
    try {
      const resource = resourceInput();
      if (id) {
        const version = Number($('resource-base-version').value);
        if (!Number.isInteger(version)) throw new Error('revision_conflict');
        await post(`/api/admin/resources/${encodeURIComponent(id)}`, {action: 'save', baseVersion: version, resource});
      } else await post('/api/admin/resources', {resource, ...( $('resource-seed-key').value ? {seedKey: $('resource-seed-key').value} : {})});
      clearResourceForm(); await Promise.all([loadResources(1), loadDashboard()]); set('resource-manager-state', 'Resource saved. Any changed source metadata must be freshly checked before it is visitor-visible.');
    } catch (error) { set('resource-form-state', errorMessage(error), true); }
  }
  async function resourceLifecycle(action) {
    const id = $('resource-record-id').value, version = Number($('resource-base-version').value);
    if (!id || !Number.isInteger(version)) return;
    const label = action === 'archive' ? 'archive this resource' : 'restore this resource';
    if (!window.confirm(`Confirm: ${label}?`)) return;
    try {
      await post(`/api/admin/resources/${encodeURIComponent(id)}`, {action, baseVersion: version, confirm: action === 'archive' ? 'ARCHIVE RESOURCE' : 'RESTORE RESOURCE'});
      clearResourceForm(); await Promise.all([loadResources(1), loadDashboard()]); set('resource-manager-state', `Resource ${action}d.`);
    } catch (error) { set('resource-form-state', errorMessage(error), true); }
  }

  function correctionPayload() {
    const proposal = {};
    [['name', 'correction-name'], ['type', 'correction-type'], ['address', 'correction-address'], ['city', 'correction-city']].forEach(([key, id]) => { if ($(id).value.trim()) proposal[key] = $(id).value; });
    return {directoryEntry: Number($('correction-entry').value), proposal, evidenceUrl: $('correction-evidence-url').value, evidenceNote: $('correction-evidence-note').value};
  }
  function clearCorrectionForm() {
    $('correction-form').reset(); $('correction-record-id').value = ''; $('correction-base-version').value = ''; set('correction-form-state', '');
  }
  function populateCorrection(correction, version) {
    $('correction-record-id').value = correction.id; $('correction-base-version').value = version || correction.version;
    $('correction-entry').value = correction.directoryEntry; $('correction-evidence-url').value = correction.evidenceUrl || ''; $('correction-evidence-note').value = correction.evidenceNote || '';
    ['name', 'type', 'address', 'city'].forEach(key => { $(`correction-${key}`).value = correction.proposal?.[key] || ''; });
    $('correction-editor').open = true; $('correction-editor').scrollIntoView({block: 'nearest'});
  }
  async function correctionRequest(id, action, body) {
    try { await post(`/api/admin/mosque-corrections/${encodeURIComponent(id)}/${action}`, body); await Promise.all([loadCorrections(1), loadDashboard()]); }
    catch (error) { set('correction-state', errorMessage(error), true); }
  }
  function renderCorrections(items) {
    const host = $('correction-list'); host.replaceChildren();
    if (!items.length) host.append(make('p', 'No correction records match this filter.', 'editorial-note'));
    items.forEach(item => {
      const card = make('article', undefined, 'staff-record');
      card.append(make('h3', `Directory entry ${item.directoryEntry} · ${item.state}`));
      const source = item.original || {}; card.append(make('p', `Government source snapshot: ${source.name || '—'} · ${source.registration || 'No registration supplied'}`, 'staff-record-facts'));
      const change = Object.entries(item.proposal || {}).map(([key, value]) => `${key}: ${value}`).join(' · '); card.append(make('p', `Community proposal: ${change || 'No display field supplied'}`));
      card.append(make('p', `Evidence: ${item.evidenceUrl} · Submitted by ${item.createdBy}`, 'staff-record-facts'));
      const time = make('time', `Version ${item.version} · ${dates(item.createdAt)}`); time.dateTime = item.createdAt || ''; card.append(time);
      const actions = make('div', undefined, 'staff-record-actions');
      if (correctionWriteRoles.has(role) && item.state === 'proposed') { const edit = make('button', 'Edit proposal'); edit.type = 'button'; edit.addEventListener('click', () => populateCorrection(item, item.version)); actions.append(edit); }
      if ((role === 'owner' || role === 'reviewer') && item.state === 'proposed') {
        for (const [label, decision] of [['Mark reviewed', 'reviewed'], ['Reject', 'rejected']]) { const button = make('button', label); button.type = 'button'; button.addEventListener('click', () => correctionRequest(item.id, 'review', {baseVersion: item.version, decision})); actions.append(button); }
      }
      if (role === 'owner' && item.state === 'reviewed') { const apply = make('button', 'Apply community overlay'); apply.type = 'button'; apply.addEventListener('click', () => { if (window.confirm('Apply this labelled community overlay? Government directory data will remain unchanged.')) correctionRequest(item.id, 'apply', {baseVersion: item.version, confirm: 'APPLY COMMUNITY OVERLAY'}); }); actions.append(apply); }
      if (actions.childNodes.length) card.append(actions); host.append(card);
    });
  }
  async function loadCorrections(page = 1) {
    const params = new URLSearchParams({page: String(page)}); if ($('correction-filter').value) params.set('state', $('correction-filter').value);
    set('correction-state', 'Loading correction overlays…');
    try { const data = await api(`/api/admin/mosque-corrections?${params}`); state.corrections.page = data.page || page; state.corrections.hasMore = data.hasMore === true; renderCorrections(data.items || []); setPage('corrections', 'correction'); set('correction-state', `Showing ${data.items?.length || 0} of ${data.total ?? 0} server-paginated correction records.`); }
    catch (error) { state.corrections.hasMore = false; setPage('corrections', 'correction'); $('correction-list').replaceChildren(); set('correction-state', errorMessage(error), true); }
  }
  async function submitCorrection(event) {
    event.preventDefault(); if (!event.currentTarget.checkValidity()) { event.currentTarget.reportValidity(); return; }
    const id = $('correction-record-id').value; set('correction-form-state', 'Storing correction proposal…');
    try {
      const payload = correctionPayload();
      if (id) await post(`/api/admin/mosque-corrections/${encodeURIComponent(id)}/revise`, {baseVersion: Number($('correction-base-version').value), correction: payload});
      else await post('/api/admin/mosque-corrections', payload);
      clearCorrectionForm(); await Promise.all([loadCorrections(1), loadDashboard()]); set('correction-state', 'Correction proposal stored as a community overlay workflow item.');
    } catch (error) { set('correction-form-state', errorMessage(error), true); }
  }

  function renderMembers(items) {
    const host = $('member-list'); host.replaceChildren();
    if (!items.length) host.append(make('p', 'No members match this search.', 'editorial-note'));
    items.forEach(item => { const card = make('article', undefined, 'staff-record'); card.append(make('strong', item.displayName || 'Unnamed member'), make('p', [item.preferredLanguage && `Language: ${item.preferredLanguage}`, item.city && `City: ${item.city}`, item.mosque && `Mosque: ${item.mosque}`].filter(Boolean).join(' · ') || 'No optional location information.')); const time = make('time', `Account created: ${dates(item.createdAt)}`); time.dateTime = item.createdAt || ''; card.append(time); host.append(card); });
  }
  async function loadMembers(page = 1) {
    const params = new URLSearchParams({page: String(page)}); if ($('member-search').value.trim()) params.set('search', $('member-search').value.trim()); set('member-state', 'Loading member directory…');
    try { const data = await api(`/api/admin/members?${params}`); state.members.page = data.page || page; state.members.hasMore = data.hasMore === true || (data.page * data.pageSize < data.total); renderMembers(data.items || []); setPage('members', 'member'); set('member-state', 'The directory intentionally excludes private contact, saved items, and learning history.'); }
    catch (error) { state.members.hasMore = false; setPage('members', 'member'); $('member-list').replaceChildren(); set('member-state', errorMessage(error), true); }
  }

  function intakeCard(item) {
    const card = make('article', undefined, 'staff-record'); card.append(make('h3', `${item.kind} · ${item.purpose} · ${item.state}`));
    const timestamp = make('time', dates(item.createdAt)); timestamp.dateTime = item.createdAt || ''; card.append(timestamp);
    if (item.redacted) card.append(make('p', 'Payload has been manually redacted. Only metadata remains.', 'staff-private'));
    else { card.append(make('p', item.details || 'No detail supplied.')); card.append(make('p', `Contact preference: ${item.contactPreference || 'none'}${item.contact ? ` · ${item.contact}` : ''}`, 'staff-private')); }
    if (!item.redacted) {
      const controls = make('div', undefined, 'staff-record-actions');
      const assignee = document.createElement('input'); assignee.type = 'text'; assignee.maxLength = 191; assignee.placeholder = 'Verified staff account ID'; assignee.value = item.assignedTo || ''; assignee.setAttribute('aria-label', `Assignee for ${item.id}`);
      const assign = make('button', 'Assign'); assign.type = 'button'; assign.addEventListener('click', async () => { if (!assignee.value.trim()) { set('intake-state', 'Enter a verified staff account ID before assigning.', true); return; } await intakeRequest(item.id, 'assign', {assigneeId: assignee.value.trim()}); });
      const resolution = document.createElement('select'); resolution.setAttribute('aria-label', `Resolution for ${item.id}`); [['addressed','Addressed'],['duplicate','Duplicate'],['not_actionable','Not actionable'],['out_of_scope','Out of scope']].forEach(([value,label]) => resolution.add(new Option(label, value)));
      const resolve = make('button', 'Resolve'); resolve.type = 'button'; resolve.addEventListener('click', () => intakeRequest(item.id, 'resolve', {resolutionCode: resolution.value}));
      const redact = make('button', 'Redact payload', 'danger'); redact.type = 'button'; redact.addEventListener('click', () => { if (window.confirm('Redact stored contact and detail fields? This cannot be undone.')) intakeRequest(item.id, 'redact', {confirm: 'REDACT SUBMISSION'}); });
      controls.append(assignee, assign, resolution, resolve, redact); card.append(controls);
    }
    return card;
  }
  function renderIntake(items) { const host = $('intake-list'); host.replaceChildren(); if (!items.length) host.append(make('p', 'No restricted intake record matches these filters.', 'editorial-note')); items.forEach(item => host.append(intakeCard(item))); }
  async function intakeRequest(id, action, body) { try { await post(`/api/admin/intake/${encodeURIComponent(id)}/${action}`, body); await Promise.all([loadIntake(1), loadDashboard()]); } catch (error) { set('intake-state', errorMessage(error), true); } }
  async function loadIntake(page = 1) {
    const params = new URLSearchParams({page: String(page)}); if ($('intake-kind-filter').value) params.set('kind', $('intake-kind-filter').value); if ($('intake-state-filter').value) params.set('state', $('intake-state-filter').value); set('intake-state', 'Loading restricted intake…');
    try { const data = await api(`/api/admin/intake?${params}`); state.intake.page = data.page || page; state.intake.hasMore = data.hasMore === true; renderIntake(data.items || []); setPage('intake', 'intake'); set('intake-state', `Showing ${data.items?.length || 0} of ${data.total ?? 0} server-paginated restricted records.`); }
    catch (error) { state.intake.hasMore = false; setPage('intake', 'intake'); $('intake-list').replaceChildren(); set('intake-state', errorMessage(error), true); }
  }

  function renderAudit(items) { const host = $('audit-list'); host.replaceChildren(); if (!items.length) host.append(make('p', 'No audit actions are available on this page.', 'editorial-note')); items.forEach(item => { const card = make('article', undefined, 'staff-record'); card.append(make('strong', `${item.action} · ${item.targetType}`), make('p', `Actor: ${item.actorId} · target: ${item.targetId}`, 'staff-record-facts')); const time = make('time', dates(item.createdAt)); time.dateTime = item.createdAt || ''; card.append(time); host.append(card); }); }
  async function loadAudit(page = 1) { set('audit-state', 'Loading audit metadata…'); try { const data = await api(`/api/admin/audit?page=${encodeURIComponent(page)}`); state.audit.page = data.page || page; state.audit.hasMore = data.hasMore === true; renderAudit(data.items || []); setPage('audit', 'audit'); set('audit-state', `Showing ${data.items?.length || 0} of ${data.total ?? 0} server-paginated audit events.`); } catch (error) { state.audit.hasMore = false; setPage('audit', 'audit'); $('audit-list').replaceChildren(); set('audit-state', errorMessage(error), true); } }

  function fillSettings(data) {
    const contact = data.contact || {}; $('contact-enabled').checked = contact.enabled === true; $('contact-type').value = contact.type || 'email'; $('contact-value').value = contact.value || '';
    const limits = data.usageLimits || {}; $('limit-study').value = Number.isInteger(limits.studyRequestsPerDay) ? limits.studyRequestsPerDay : 0; $('limit-speech').value = Number.isInteger(limits.speechRequestsPerDay) ? limits.speechRequestsPerDay : 0; $('limit-concurrent').value = Number.isInteger(limits.maxConcurrentJobs) ? limits.maxConcurrentJobs : 1;
    $('retention-days').value = Number.isInteger(data.retention?.intakeDays) ? data.retention.intakeDays : 90;
  }
  async function loadSettings() { try { fillSettings(await api('/api/admin/settings')); set('settings-state', 'Safe settings loaded. Contact is disabled until a valid value is supplied; retention is dry-run only.'); } catch (error) { set('settings-state', errorMessage(error), true); } }
  async function saveSetting(key, value) { try { const data = await post('/api/admin/settings', {key, value}); fillSettings(data); set('settings-state', `${key} saved with server validation and audit metadata.`); await loadDashboard(); } catch (error) { set('settings-state', errorMessage(error), true); } }
  async function dryRun() { try { const data = await api('/api/admin/settings/retention/dry-run'); set('settings-state', `${data.eligibleRecords} record(s) match the selected date. ${data.message}`); } catch (error) { set('settings-state', errorMessage(error), true); } }

  function bindEvents() {
    $('dashboard-refresh').addEventListener('click', loadDashboard);
    $('resource-search-form').addEventListener('submit', event => { event.preventDefault(); loadResources(1); }); $('resource-clear').addEventListener('click', () => { $('resource-search-form').reset(); loadResources(1); }); $('resource-form').addEventListener('submit', submitResource); $('resource-cancel').addEventListener('click', clearResourceForm); $('resource-archive').addEventListener('click', () => resourceLifecycle('archive')); $('resource-restore').addEventListener('click', () => resourceLifecycle('restore')); bindPage('resources', 'resource', loadResources);
    $('correction-filter-form').addEventListener('submit', event => { event.preventDefault(); loadCorrections(1); }); $('correction-refresh').addEventListener('click', () => loadCorrections(1)); $('correction-form').addEventListener('submit', submitCorrection); $('correction-cancel').addEventListener('click', clearCorrectionForm); bindPage('corrections', 'correction', loadCorrections);
    $('member-search-form').addEventListener('submit', event => { event.preventDefault(); loadMembers(1); }); $('member-clear').addEventListener('click', () => { $('member-search').value = ''; loadMembers(1); }); bindPage('members', 'member', loadMembers);
    $('intake-filter-form').addEventListener('submit', event => { event.preventDefault(); loadIntake(1); }); $('intake-refresh').addEventListener('click', () => loadIntake(1)); bindPage('intake', 'intake', loadIntake); bindPage('audit', 'audit', loadAudit);
    $('study-ops-refresh').addEventListener('click', loadStudyOperations);
    $('podcast-ops-refresh').addEventListener('click', loadPodcastOperations);
    $('study-reports-filter-form').addEventListener('submit', event => { event.preventDefault(); loadStudyReports(1); });
    bindPage('studyReports','study-reports',loadStudyReports);
    $('contact-settings-form').addEventListener('submit', event => { event.preventDefault(); saveSetting('contact', {enabled: $('contact-enabled').checked, type: $('contact-type').value, value: $('contact-value').value}); });
    $('limits-settings-form').addEventListener('submit', event => { event.preventDefault(); saveSetting('usageLimits', {studyRequestsPerDay: Number($('limit-study').value), speechRequestsPerDay: Number($('limit-speech').value), maxConcurrentJobs: Number($('limit-concurrent').value)}); });
    $('retention-settings-form').addEventListener('submit', event => { event.preventDefault(); saveSetting('retention', {intakeDays: Number($('retention-days').value), dryRunOnly: true, automaticPurge: false}); }); $('retention-dry-run').addEventListener('click', dryRun);
  }
  async function init() {
    bindEvents();
    try { const session = await api('/api/review/session'); role = session.user?.role || null; $('staff-session').textContent = role ? `Verified role: ${role}.` : 'No verified staff role is available.'; }
    catch (error) { $('staff-session').textContent = errorMessage(error); $('staff-no-access').hidden = false; set('staff-status', 'Staff data was not loaded.', true); return; }
    if (!staffRoles.has(role)) { $('staff-no-access').hidden = false; set('staff-status', '403: this account does not have a verified staff role.', true); return; }
    $('staff-workspace').hidden = false; roleVisibility(); set('staff-status', 'Staff hub ready. Visible actions reflect the verified server role.');
    const pending = [loadDashboard(), loadCorrections(1)];
    if (curationRoles.has(role)) pending.push(loadResources(1));
    if (role === 'owner') pending.push(loadMembers(1), loadIntake(1), loadAudit(1), loadSettings(),loadStudyOperations(),loadPodcastOperations(),loadStudyReports(1));
    await Promise.all(pending);
  }
  init();
})();
