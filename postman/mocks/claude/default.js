/* global require, process */
// SYNTHETIC Claude v1 stand-in, local-only. No upstream traffic or workspace binding.
// Postman loads handlers as CommonJS, including in an ESM repository.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('node:http');
const meta = { api_version: 'v1', generated_at: '2026-10-21T12:00:00Z',
  content_revision: 'SYNTHETIC-1', editorial_reviewed_at: '2026-10-21T11:00:00Z', coverage_start: '2026-01-01' };
const event = {
  id: 'synthetic-http-event', kind: 'usage_reset', event_status: 'confirmed',
  title: 'SYNTHETIC reset', summary: 'SYNTHETIC local HTTP fixture',
  time_precision: 'exact', announced_at: '2026-10-20T10:00:00Z', announced_on: null, utc_day: '2026-10-20',
  effective_at: null, effective_note: null, reset_offer: null, allocation: 'subscription_usage',
  audience: { scope: 'limited', statement: 'SYNTHETIC pro users', plans: ['pro'], exclusions: null },
  windows: ['weekly'], sources: [{ url: 'https://example.invalid/synthetic-evidence', handle: 'synthetic',
    display_name: 'SYNTHETIC', role: 'original', kind: 'web_page', posted_at: null, excerpt: null }],
  url: 'https://example.invalid/synthetic-event', first_published_at: '2026-10-20T10:00:00Z',
  revised_at: '2026-10-20T10:00:00Z', revision: 1, correction: null, related_event_ids: [],
};
http.createServer((req, res) => {
  const send = (code, data, headers = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=60', ...headers });
    res.end(data === null ? undefined : JSON.stringify(data));
  };
  if (req.method !== 'GET' || !String(req.headers['user-agent']).startsWith('ResetRadar/')) return send(400, { synthetic: 'invalid_request' });
  const mode = req.headers['x-reset-radar-test'];
  if (mode === '503' || mode === '429') return send(Number(mode), { synthetic: 'error' }, { 'Retry-After': '180' });
  if (mode === 'nonjson') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<p>SYNTHETIC</p>'); return; }
  if (mode === 'hang') return;
  if (mode === 'bad-schema') return send(200, { data: [], unknown: 'SYNTHETIC' });
  if (req.headers['if-none-match'] === '"synthetic-v1"') return send(304, null);
  if (req.url === '/api/v1/resets?limit=100') {
    return send(200, { data: [event], pagination: { has_more: false, next_cursor: null, revision_changed: false }, meta }, { ETag: '"synthetic-v1"' });
  }
  if (req.url === '/api/v1/status') {
    return send(200, { data: { latest_reset: event, latest_ambiguous: null, announced_reset: null,
      active_watch: null, reset_offers: [], stats: { total: 1, last_reset_at: event.announced_at,
        last_reset_on: null, days_since_last: 1, avg_interval_days: null, longest_gap_days: null,
        eligible_gaps: 0, total_gaps: 0, exact_count: 1, partial_sample: true },
      filters: { audience: 'all', window: 'any' } }, meta });
  }
  if (req.url === '/api/v1/sources') return send(200, { data: [], meta });
  return send(501, { synthetic: 'unmodelled_path' });
}).listen(process.env.PORT);
