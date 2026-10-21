const reservedPaths = new Set(['/api/v1/events', '/api/v1/status', '/api/v1/stats']);
const allow = 'GET, HEAD, OPTIONS';

/** Stage 1 reserves routes only. No environment, storage or network dependency. */
export function routeRequest(request: Request): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  const reserved = reservedPaths.has(new URL(request.url).pathname);
  let status: number;
  let code: string;
  let message: string;

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    status = 405;
    code = 'method_not_allowed';
    message = 'Only read-only HTTP methods are allowed.';
    headers.set('Allow', allow);
  } else if (reserved && request.method === 'OPTIONS') {
    headers.set('Allow', allow);
    headers.delete('Content-Type');
    return new Response(null, { status: 204, headers });
  } else if (reserved) {
    status = 501;
    code = 'not_implemented';
    message = 'The public API is not implemented.';
  } else {
    status = 404;
    code = 'not_found';
    message = 'Route not found.';
  }

  const body = request.method === 'HEAD' ? null : JSON.stringify({ error: { code, message } });
  return new Response(body, { status, headers });
}
