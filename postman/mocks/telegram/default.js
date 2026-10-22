/* global require, process, Buffer */
// SYNTHETIC local sendMessage subset of https://core.telegram.org/bots/api.
// No proxy, external fetch, real credentials, workspace, or real delivery.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('node:http');
let sequence = 0;
const received = [];
http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  // Local test instrumentation only, outside the modelled Bot API subset.
  if (req.url === '/__synthetic_requests' && req.method === 'GET') return send(200, received);
  if (req.url !== '/bot000000:STAGE5_SYNTHETIC_ONLY/sendMessage') return send(501, {synthetic: 'unmodelled_path'});
  if (req.method !== 'POST' || !String(req.headers['content-type']).startsWith('application/json')) {
    return send(400, {ok: false, error_code: 400, description: 'SYNTHETIC invalid request'});
  }
  let body;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 24 * 1024) throw new Error('synthetic_body_limit');
      chunks.push(chunk);
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return send(400, {ok: false, error_code: 400, description: 'SYNTHETIC invalid JSON'}); }
  if (body.chat_id !== -1000000000005 || typeof body.text !== 'string' || !body.text.length || body.text.length > 4096 ||
      body.link_preview_options?.is_disabled !== true ||
      Object.keys(body).some((key) => !['chat_id', 'text', 'link_preview_options'].includes(key))) {
    return send(400, {ok: false, error_code: 400, description: 'SYNTHETIC contract violation'});
  }
  const mode = req.headers['x-reset-radar-test'];
  received.push({method: req.method, mode: mode ?? 'normal'});
  if (received.length > 1000) received.shift();
  if (mode === 'rate') return send(429, {ok: false, error_code: 429, description: 'SYNTHETIC flood', parameters: {retry_after: 2}});
  if (mode === 'reject') return send(403, {ok: false, error_code: 403, description: 'SYNTHETIC forbidden'});
  if (mode === 'migration') return send(400, {ok: false, error_code: 400, description: 'SYNTHETIC migrate', parameters: {migrate_to_chat_id: -1000000000006}});
  if (mode === '500-json') return send(500, {ok: false, error_code: 500, description: 'SYNTHETIC server error'});
  if (mode === '500-html') { res.writeHead(500, {'Content-Type': 'text/html'}); return res.end('<p>SYNTHETIC proxy error</p>'); }
  if (mode === 'malformed') return send(200, {ok: true, result: {message_id: 7}});
  if (mode === 'hang') { res.writeHead(200, {'Content-Type': 'application/json'}); res.write('{"ok":'); return; }
  if (mode === 'disconnect') { req.socket.destroy(); return; }
  sequence += 1;
  return send(200, {ok: true, result: {message_id: sequence, date: 1792670400,
    chat: {id: body.chat_id, type: 'channel', title: 'SYNTHETIC local channel'}, text: body.text}});
}).listen(process.env.PORT);
