#!/usr/bin/env bash
# Dormant Railway pilot entrypoint. Real Serve behavior must be verified on an approved service.
set -euo pipefail
set +x
umask 077

fail() { printf 'Private Railway startup refused: %s\n' "$1" >&2; exit 2; }
[[ "${RAILWAY_PROJECT_ID:-}" == '786918bd-4ce1-4075-b763-93c7c6f729a1' ]] || fail 'wrong project'
[[ "${RAILWAY_ENVIRONMENT_ID:-}" == '91d899e3-0a5e-4a7f-9bcb-c840f7a22f66' ]] || fail 'wrong environment'
[[ "${AUTH_PROVIDER:-}" == 'tailscale-serve' && "${REVIEW_BIND_HOST:-}" == '127.0.0.1' ]] || fail 'loopback Serve mode required'
[[ "${REVIEW_DB_TRANSPORT:-}" == 'railway-internal-wireguard' && "${REVIEW_DB_ROLE:-}" == 'app' && -n "${DATABASE_URL:-}" ]] || fail 'private app database transport required'
[[ "${REVIEW_PUBLIC_ORIGIN:-}" =~ ^https://[a-z0-9-]+(\.[a-z0-9-]+)+\.ts\.net$ ]] || fail 'exact tailnet HTTPS origin required'
session_secret=${REVIEW_SESSION_SECRET:-}
[[ -n "${REVIEW_APP_ID:-}" && ${#session_secret} -ge 32 ]] || fail 'private session configuration required'
[[ -z "${DD_PUBLIC_READ_MODE:-}" && -z "${EDITORIAL_OWNER_ID:-}" && -z "${REVIEW_OWNER_ID:-}" ]] || fail 'unsafe public or inherited owner configuration'
[[ "${RAILWAY_VOLUME_MOUNT_PATH:-}" == '/var/lib/tailscale' && -d /var/lib/tailscale && -w /var/lib/tailscale && ! -L /var/lib/tailscale ]] || fail 'persistent dedicated Tailscale state volume required'
[[ -n "${TS_AUTHKEY:-}" || -s /var/lib/tailscale/tailscaled.state ]] || fail 'protected first-boot Tailscale auth key required'

# mysql2 emits no credentials here; rejects a public proxy, root app user, Preview or VM socket.
node --input-type=module -e "import { databaseConnectionOptions } from './server/db.mjs'; const c = databaseConnectionOptions(); if (!c.host.endsWith('.railway.internal') || typeof c.stream !== 'function') process.exit(2)" >/dev/null || fail 'database connection guard failed'
command -v tailscaled >/dev/null && command -v tailscale >/dev/null || fail 'Tailscale binaries missing'
command -v gosu >/dev/null || fail 'unprivileged app launcher missing'

socket=/tmp/dragon-dawwa-tailscaled.sock
state=/var/lib/tailscale/tailscaled.state
chmod 700 /var/lib/tailscale
# A dedicated node is necessary: serve reset intentionally clears earlier Serve/Funnel setup.
env -u DATABASE_URL -u REVIEW_SESSION_SECRET -u GEMINI_API_KEY -u QURAN_CLIENT_SECRET -u TS_AUTHKEY \
  tailscaled --tun=userspace-networking --socket="$socket" --state="$state" --verbose=0 >/dev/null 2>&1 &
daemon=$!
app=''
cleanup() {
  [[ -z "$app" ]] || { kill "$app" 2>/dev/null || true; wait "$app" 2>/dev/null || true; }
  kill "$daemon" 2>/dev/null || true
  wait "$daemon" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 143' TERM INT

ready=false
for i in $(seq 1 40); do
  if tailscale --socket="$socket" status --json >/dev/null 2>&1; then ready=true; break; fi
  kill -0 "$daemon" 2>/dev/null || fail 'Tailscale daemon stopped'
  sleep 1
done
[[ "$ready" == true ]] || fail 'Tailscale daemon did not become ready'

# Persisted state keeps one stable node; a protected auth key is used only if login is needed.
if ! tailscale --socket="$socket" status --json 2>/dev/null |
  node -e "let s='';process.stdin.on('data',b=>s+=b).on('end',()=>{try{process.exit(JSON.parse(s).BackendState==='Running'?0:1)}catch{process.exit(1)}})"; then
  [[ -n "${TS_AUTHKEY:-}" ]] || fail 'tailnet reauthentication required'
  timeout 90s tailscale --socket="$socket" up --auth-key="$TS_AUTHKEY" --hostname=dragon-dawwa-private --accept-dns=false --accept-routes=false >/dev/null 2>&1 || fail 'Tailscale login failed'
fi

# Refuse an unexpected node/tailnet even if a persisted volume is attached by mistake.
tailscale --socket="$socket" status --json 2>/dev/null |
  node -e "let s='';process.stdin.on('data',b=>s+=b).on('end',()=>{try{const d=JSON.parse(s),actual=d.Self?.DNSName?.replace(/\\.$/,'');process.exit(d.BackendState==='Running' && 'https://'+actual===process.env.REVIEW_PUBLIC_ORIGIN?0:1)}catch{process.exit(1)}})" || fail 'tailnet origin does not match this node'

# Reset the dedicated node's old Serve configuration before installing HTTPS Serve (never Funnel).
timeout 30s tailscale --socket="$socket" serve reset >/dev/null 2>&1 || fail 'Serve reset failed'
timeout 90s tailscale --socket="$socket" serve --bg --yes --https=443 http://127.0.0.1:3000 >/dev/null 2>&1 || fail 'HTTPS Serve could not start'
tailscale --socket="$socket" serve status --json 2>/dev/null |
  node -e "let s='';process.stdin.on('data',b=>s+=b).on('end',()=>{try{const c=JSON.parse(s);function publicOn(v){if(!v||typeof v!=='object')return false;return Object.entries(v).some(([k,x])=>k==='AllowFunnel'&&(x===true||(x&&typeof x==='object'&&Object.values(x).some(Boolean)))||publicOn(x))}process.exit(publicOn(c)?1:0)}catch{process.exit(1)}})" || fail 'Funnel or unparseable Serve status'

unset TS_AUTHKEY
gosu node node server/index.mjs &
app=$!
# Exit if either the app or the tailnet daemon stops; no degraded public fallback.
wait -n "$app" "$daemon" || fail 'app or tailnet daemon stopped'
fail 'app or tailnet daemon exited'
