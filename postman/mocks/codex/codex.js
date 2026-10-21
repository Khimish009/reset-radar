/* global require, process */
// SYNTHETIC codexreset.ai v1 stand-in derived from its developer contract.
// Local only: no upstream traffic or external workspace. CommonJS for Postman CLI.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('node:http');
const event = {
  id: 'synthetic-http-codex', date: '2026-10-20', ts: '2026-10-20T12:00:00Z',
  kind: 'regular', scope: 'SYNTHETIC paid cohort', summary: 'SYNTHETIC local contract example',
  summary_unavailable: false, url: 'https://example.invalid/posts/synthetic-announcement',
  seeded: true, announced_at: '2026-10-20T12:00:00Z', delivered_at: null,
  delivered_source_url: null, delivery_reported_delay: false, delivery_note_en: null,
};
const feed = {
  schema_version: 1, generated_at: '2026-10-21T12:00:00Z', source: 'https://codexreset.ai',
  attribution: { seed_archive: 'https://example.invalid/archive', note: 'SYNTHETIC archive credit' },
  events: [event], scheduled: null,
};
http.createServer((req, res) => {
  const send = (status, payload, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300', ...headers });
    res.end(payload === null ? undefined : JSON.stringify(payload));
  };
  if (req.url !== '/api/v1/resets.json') return send(501, { synthetic: 'unmodelled_path' });
  if (req.method !== 'GET' || !String(req.headers['user-agent']).startsWith('ResetRadar/')) {
    return send(400, { synthetic: 'invalid_request' });
  }
  const mode = req.headers['x-reset-radar-test'];
  if (mode === '429' || mode === '503') return send(Number(mode), { synthetic: 'error' }, { 'Retry-After': '180' });
  if (mode === 'nonjson') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<p>SYNTHETIC</p>'); return; }
  if (mode === 'bad-schema') return send(200, { ...feed, schema_version: 999 });
  if (mode === 'hang') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"schema_version":');
    return;
  }
  if (mode === 'missing') return send(200, { ...feed, events: [] }, { ETag: '"synthetic-missing"' });
  if (req.headers['if-none-match'] === '"synthetic-v1"') return send(304, null);
  return send(200, feed, { ETag: '"synthetic-v1"' });
}).listen(process.env.PORT);
