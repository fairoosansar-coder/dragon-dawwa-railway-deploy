#!/usr/bin/env node
// Process-failure signal only. The protected endpoint arrives via stdin, never
// an argument, inherited environment variable, log, or source literal.
let urlText = '';
for await (const chunk of process.stdin) {
  urlText += chunk.toString('utf8');
  if (urlText.length > 2048) {
    console.error('BACKUP_ALERT_NOT_DELIVERED: invalid notification configuration');
    process.exit(1);
  }
}
const exitStatus = Number(process.argv[2]);
const projectId = '786918bd-4ce1-4075-b763-93c7c6f729a1';
const serviceId = 'fa68458e-15f8-4338-935b-70fe94b95748';

let url;
try {
  url = new URL(urlText);
  if (url.protocol !== 'https:' || url.hostname !== 'api.manus.im' || url.port !== '' ||
      !/^\/api\/webhook\/triggers\/[0-9a-f-]{36}$/.test(url.pathname) ||
      url.search || url.hash || url.username || url.password) {
    throw new Error('unapproved webhook destination');
  }
  if (!Number.isInteger(exitStatus) || exitStatus < 1 || exitStatus > 255) {
    throw new Error('invalid backup exit status');
  }
} catch {
  console.error('BACKUP_ALERT_NOT_DELIVERED: invalid notification configuration');
  process.exitCode = 1;
}

if (url && process.exitCode !== 1) {
  const payload = JSON.stringify({
    event: 'dragon-dawwa-backup-failed',
    project_id: projectId,
    service_id: serviceId,
    utc: new Date().toISOString(),
    exit_status: exitStatus,
  });
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('delivery rejected');
    console.error('Backup failure alert accepted by trigger');
  } catch {
    console.error('BACKUP_ALERT_NOT_DELIVERED: check webhook connectivity and restore point');
    process.exitCode = 1;
  }
}
