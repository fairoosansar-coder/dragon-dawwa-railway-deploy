'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const C = window.DD_RESEARCH_COPY;
  const E = Object.fromEntries($$('[data-r]').map(el => [el.dataset.r, el.innerHTML]));
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let lang = 'en';
  try { const stored = JSON.parse(localStorage.getItem('dd-language')); if (['en','ta','si'].includes(stored)) lang = stored; } catch {}
  const l = values => values[lang === 'ta' ? 1 : lang === 'si' ? 2 : 0];
  const t = key => l(C.dynamic[key]);
  const name = area => area.names?.[lang] || area.names?.en || area.name;
  const number = n => new Intl.NumberFormat('en-GB').format(n);
  const percent = (n, total) => n === null ? '—' : (100 * n / total).toFixed(1) + '%';
  const PAGE_SIZE = 20, MOSQUE_PAGE_SIZE = 12;
  let population, mosques, populationError = false, mosqueError = false;
  let popPage = 1, mosquePage = 1, activeRows = [], popBusy = false, renderToken = 0;
  const gnCache = new Map();
  const censusBase = 'https://www.statistics.gov.lk/Population/StaticalInformation/CPH2024/';
  const mosquePdf = 'https://muslimaffairs.gov.lk/wp-content/uploads/2023/12/ANURADHAPURA-DISTRICT.pdf';

  async function getJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error('Data unavailable');
    return response.json();
  }
  function options(select, items, value) {
    select.innerHTML = items.map(([id, label]) => `<option value="${escape(id)}">${escape(label)}</option>`).join('');
    if (items.some(([id]) => id === value)) select.value = value;
  }
  function setupDistricts() {
    if (!population) return;
    options($('#district-select'), population.districts.map(d => [d.id, name(d)]), $('#district-select').value || '71');
    setupDivisions();
  }
  function setupDivisions(reset = false) {
    if (!population) return;
    const value = reset ? '' : $('#division-select').value;
    options($('#division-select'), [['', t('allDS')], ...population.divisions.filter(d => d.district === $('#district-select').value).map(d => [d.id, name(d)])], value);
  }
  function setupCities() {
    if (!mosques) return;
    const value = $('#mosque-city').value;
    const cities = [...new Set(mosques.map(m => m.city))].filter(Boolean).sort();
    options($('#mosque-city'), [['', t('allCities')], ...cities.map(c => [c, c]), ['__empty', t('missingCity')]], value);
  }
  function renderEditorial() {
    $('#evidence-gaps').innerHTML = C.gaps.map(g => `<div class="evidence-row"><span>${escape(t('pending'))}</span><strong>${escape(l(g.title))}</strong><p>${escape(l(g.body))}</p></div>`).join('');
    $('#resource-cards').innerHTML = C.resources.map((r, i) => `<article class="resource-card"><span class="resource-number">${String(i + 1).padStart(2,'0')}</span><h3>${escape(l(r.title))}</h3><p>${escape(l(r.body))}</p><a href="${escape(r.url)}" target="_blank" rel="noopener">${escape(t('openResource'))}</a></article>`).join('');
    $('#activity-cards').innerHTML = C.activities.map(a => `<article class="activity-card"><span class="eyebrow">${escape(t('proposed'))}</span><h3>${escape(l(a.title))}</h3><p>${escape(l(a.body))}</p></article>`).join('');
    $('#participation-steps').innerHTML = C.steps.map(s => `<li><h3>${escape(l(s.title))}</h3><p>${escape(l(s.body))}</p></li>`).join('');
    const open = $$('#method-details details').map(d => d.open);
    $('#method-details').innerHTML = C.methods.map((m,i) => `<details${open[i] ? ' open' : ''}><summary>${escape(l(m.title))}</summary><p>${escape(l(m.body))}</p></details>`).join('');
  }
  function setLanguage() {
    document.documentElement.lang = lang;
    document.title = t('title');
    $('#research-language').value = lang;
    $('#research-language').setAttribute('aria-label', t('chooseLanguage'));
    $$('[data-r]').forEach(el => { el.innerHTML = lang === 'en' ? E[el.dataset.r] : C.ui[el.dataset.r][lang === 'ta' ? 0 : 1]; });
    $('#area-search').placeholder = t('searchArea');
    $('#mosque-search').placeholder = t('searchMosque');
    renderEditorial(); setupDistricts(); setupCities(); renderPopulation(); renderMosques();
  }
  function pageState(kind, page, total, size) {
    const pages = Math.max(1, Math.ceil(total / size));
    $(`#${kind}-prev`).disabled = page <= 1;
    $(`#${kind}-next`).disabled = page >= pages;
    $(`#${kind}-page`).textContent = `${t('page')} ${page} ${t('of')} ${pages}`;
  }
  function selectedArea() {
    if ($('#area-level').value === 'district') return population.national;
    const district = population.districts.find(d => d.id === $('#district-select').value);
    return $('#area-level').value === 'gn' && $('#division-select').value ? population.divisions.find(d => d.id === $('#division-select').value) : district;
  }
  async function renderPopulation() {
    const token = ++renderToken;
    const level = $('#area-level').value;
    $('#district-select').disabled = level === 'district';
    $('#division-control').hidden = level !== 'gn';
    $('#export-population').disabled = true;
    if (!population || populationError) {
      $('#population-rows').innerHTML = `<tr><td colspan="5" class="table-empty">${escape(t(populationError ? 'error' : 'loading'))}</td></tr>`;
      pageState('population', 1, 0, PAGE_SIZE); return;
    }
    const selected = selectedArea();
    $('#selected-stat').innerHTML = `<div><h3>${escape(name(selected))}</h3><p>${escape(t('census'))} · ${number(selected.total)} ${escape(t('residents'))} · ${percent(selected.islam, selected.total)} ${escape(t('muslims'))}</p><p>${escape(t('contextLabel'))}</p></div><strong>${number(selected.islam)}</strong>`;
    let rows;
    popBusy = true;
    if (level === 'district') rows = population.districts;
    else if (level === 'ds') rows = population.divisions.filter(d => d.district === $('#district-select').value);
    else {
      const district = $('#district-select').value;
      const ds = $('#division-select').value;
      if (!gnCache.has(district)) {
        $('#population-rows').innerHTML = `<tr><td colspan="5" class="table-empty">${escape(t('loading'))}</td></tr>`;
        $('#population-prev').disabled = $('#population-next').disabled = true;
        gnCache.set(district, getJSON(`data/gn-${district}.json`).catch(error => { gnCache.delete(district); throw error; }));
      }
      try { rows = await gnCache.get(district); }
      catch {
        if (token !== renderToken) return;
        popBusy = false; activeRows = [];
        $('#population-count').textContent = '';
        $('#population-rows').innerHTML = `<tr><td colspan="5" class="table-empty">${escape(t('error'))}</td></tr>`;
        pageState('population', 1, 0, PAGE_SIZE); return;
      }
      if (token !== renderToken) return;
      rows = rows.filter(r => !ds || r.ds === ds);
    }
    const query = $('#area-search').value.trim().toLocaleLowerCase();
    rows = rows.filter(r => [r.name, r.id, ...Object.values(r.names || {})].join(' ').toLocaleLowerCase().includes(query));
    rows = [...rows].sort($('#population-sort').value === 'islam'
      ? (a,b) => (b.islam ?? -1) - (a.islam ?? -1) || name(a).localeCompare(name(b),lang)
      : (a,b) => name(a).localeCompare(name(b),lang));
    activeRows = rows; popBusy = false;
    popPage = Math.min(popPage, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
    $('#population-count').textContent = `${number(rows.length)} ${t('results')}`;
    $('#population-rows').innerHTML = rows.length ? rows.slice((popPage - 1) * PAGE_SIZE, popPage * PAGE_SIZE).map(r => {
      const parent = level === 'gn' ? population.divisions.find(d => d.id === r.ds) : level === 'ds' ? population.districts.find(d => d.id === r.district) : null;
      const context = (parent ? name(parent) + ' · ' : '') + r.id;
      return `<tr><td>${escape(name(r))}${r.names && lang !== 'en' ? `<small lang="en">${escape(r.names.en)}</small>` : ''}</td><td class="number">${number(r.total)}</td><td class="number">${r.islam === null ? `<span aria-label="${escape(t('notReported'))}" title="${escape(t('notReported'))}">—</span>` : number(r.islam)}</td><td class="number">${percent(r.islam,r.total)}</td><td>${escape(context)}</td></tr>`;
    }).join('') : `<tr><td colspan="5" class="table-empty">${escape(t('noResults'))}</td></tr>`;
    $('#export-population').disabled = !rows.length;
    pageState('population', popPage, rows.length, PAGE_SIZE);
  }
  function renderMosques() {
    if (!mosques || mosqueError) {
      $('#mosque-results').innerHTML = `<p class="small-note">${escape(t(mosqueError ? 'error' : 'loading'))}</p>`;
      pageState('mosque', 1, 0, MOSQUE_PAGE_SIZE); return;
    }
    const query = $('#mosque-search').value.trim().toLocaleLowerCase();
    const city = $('#mosque-city').value;
    // Community display order only: keep the government entry numbers intact.
    const featuredOrder = new Map([[17, 0], [97, 1]]);
    const rows = mosques.filter(m => (!city || (city === '__empty' ? !m.city : m.city === city)) && [m.name,m.registration,m.address,m.city,String(m.entry)].join(' ').toLocaleLowerCase().includes(query))
      .sort((a, b) => (featuredOrder.get(a.entry) ?? a.entry + 2) - (featuredOrder.get(b.entry) ?? b.entry + 2));
    mosquePage = Math.min(mosquePage, Math.max(1, Math.ceil(rows.length / MOSQUE_PAGE_SIZE)));
    $('#mosque-count').textContent = `${number(rows.length)} ${t('results')}`;
    $('#mosque-results').innerHTML = rows.length ? rows.slice((mosquePage - 1) * MOSQUE_PAGE_SIZE, mosquePage * MOSQUE_PAGE_SIZE).map(m => `<article class="directory-card${m.entry === 97 ? ' is-ours' : ''}"><div class="entry-line"><span>${escape(t('entry'))} ${m.entry} · ${escape(t('type'))} ${escape(m.type)}</span>${m.entry === 97 ? `<span>${escape(t('ours'))}</span>` : ''}</div><h3 lang="en">${escape(m.name)}</h3><p class="registration">${escape(m.registration)}</p><p class="address"><span lang="en">${escape(m.address)}</span><br>${m.city ? `<span lang="en">${escape(m.city)}</span>` : escape(t('missingCity'))}</p><a class="source-link" href="${mosquePdf}#page=${m.page}" target="_blank" rel="noopener">${escape(t('sourcePage'))} ${m.page} ↗</a></article>`).join('') : `<p class="small-note">${escape(t('noResults'))}</p>`;
    pageState('mosque', mosquePage, rows.length, MOSQUE_PAGE_SIZE);
  }
  function exportPopulation() {
    if (popBusy || !activeRows.length) return;
    const level = $('#area-level').value;
    const source = censusBase + (level === 'district' ? 'PopulationA/A3' : level === 'ds' ? 'PopulationA/A7' : 'GNLevel/GN_Level_Population_by_Religion');
    const districtName = population.districts.find(d => d.id === $('#district-select').value)?.names.en;
    const rows = [['Census year','Area level','District','DS division','Area name','Area code','All residents','Muslims (Islam)','Share percent','Disclosure note','Official source','Source checked']];
    activeRows.forEach(r => rows.push([2024,level,level === 'district' ? r.names.en : districtName,level === 'gn' ? population.divisions.find(d => d.id === r.ds)?.names.en : level === 'ds' ? r.names.en : '',r.names?.en || r.name,r.id,r.total,r.islam ?? '',r.islam === null ? '' : (100 * r.islam/r.total).toFixed(1),level === 'gn' ? 'DCS groups religion counts below 10 into Other; blanks are not proof of zero. Not mosque membership.' : 'Administrative-area population, not mosque membership.',source,'2026-10-04']));
    const csv = '\uFEFF' + rows.map(row => row.map(v => '"' + String(v ?? '').replace(/"/g,'""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = `dragon-dawwa-census-2024-${level}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('#research-language').addEventListener('change', event => {
    lang = event.target.value;
    try { localStorage.setItem('dd-language', JSON.stringify(lang)); } catch {}
    setLanguage();
  });
  $('#area-level').addEventListener('change', () => { popPage = 1; $('#area-search').value = ''; renderPopulation(); });
  $('#district-select').addEventListener('change', () => { popPage = 1; $('#area-search').value = ''; setupDivisions(true); renderPopulation(); });
  $('#division-select').addEventListener('change', () => { popPage = 1; $('#area-search').value = ''; renderPopulation(); });
  $('#area-search').addEventListener('input', () => { popPage = 1; renderPopulation(); });
  $('#population-sort').addEventListener('change', () => { popPage = 1; renderPopulation(); });
  $('#population-prev').addEventListener('click', () => { popPage = Math.max(1,popPage - 1); renderPopulation(); });
  $('#population-next').addEventListener('click', () => { popPage++; renderPopulation(); });
  $('#export-population').addEventListener('click', exportPopulation);
  $('#mosque-search').addEventListener('input', () => { mosquePage = 1; renderMosques(); });
  $('#mosque-city').addEventListener('change', () => { mosquePage = 1; renderMosques(); });
  $('#find-our-mosque').addEventListener('click', () => { $('#mosque-search').value = 'R/2141/A 112'; $('#mosque-city').value = ''; mosquePage = 1; renderMosques(); });
  $('#mosque-prev').addEventListener('click', () => { mosquePage = Math.max(1,mosquePage - 1); renderMosques(); });
  $('#mosque-next').addEventListener('click', () => { mosquePage++; renderMosques(); });
  setLanguage();
  getJSON('data/population.json').then(data => { population = data; setupDistricts(); renderPopulation(); }).catch(() => { populationError = true; renderPopulation(); });
  getJSON('data/mosques-anuradhapura.json').then(data => { mosques = data; setupCities(); renderMosques(); }).catch(() => { mosqueError = true; renderMosques(); });
})();
