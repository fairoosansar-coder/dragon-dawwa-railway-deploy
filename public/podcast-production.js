(() => {
  'use strict';
  const stages = ['Report drafted', 'Reviewer attested', 'Report approved', 'Script drafted', 'Hadith review', 'Language review', 'Recitation ready', 'Assets approved', 'Cost-measurement render', 'Final listen and publish'];
  const host = document.getElementById('production-stages');
  stages.forEach((label, index) => { const item = document.createElement('article'); item.className = 'production-stage'; item.append(Object.assign(document.createElement('strong'), {textContent: `${index + 1}. ${label}`}), Object.assign(document.createElement('span'), {textContent: 'Blocked until prerequisite evidence is recorded.'})); host.append(item); });
  async function load() {
    const status = document.getElementById('production-status'), gates = document.getElementById('render-gates');
    try {
      const response = await fetch('/api/admin/podcast/availability', {credentials: 'same-origin', headers: {Accept: 'application/json'}});
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'unavailable');
      const values = {'Render mode': data.renderMode || 'disabled', 'Current blocker': data.reason || 'foundation_not_wired', 'Report adapter': data.reportAdapterConnected ? 'Connected' : 'Not connected', 'Private storage': data.privateStorageApproved ? 'Approved' : 'Not approved', 'ffmpeg worker': data.ffmpegWorkerApproved ? 'Approved' : 'Not approved', 'Credit cap': data.dailyCreditCapConfigured ? 'Configured' : 'Not configured'};
      gates.replaceChildren(); for (const [label, value] of Object.entries(values)) { const group = document.createElement('div'), term = document.createElement('dt'), description = document.createElement('dd'); term.textContent = label; description.textContent = value; group.append(term, description); gates.append(group); }
      status.textContent = data.message || 'Controls remain non-operative until every gate is green.';
    } catch { status.textContent = 'Production controls remain disabled while the private foundation is unavailable.'; }
  }
  load();
})();
