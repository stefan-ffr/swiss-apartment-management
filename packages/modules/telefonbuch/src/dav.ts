import http from 'node:http';
import https from 'node:https';

export interface DavResponse {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

/**
 * Sabre/DAV (Nextcloud) does not reliably accept chunked transfer for
 * PUT/MKCOL. We therefore use a hand-rolled http.request with explicit
 * `Content-Length` and `Connection: close` instead of fetch/undici.
 */
export function davRequest(
  method: string,
  urlStr: string,
  headers: Record<string, string | undefined>,
  body?: string,
): Promise<DavResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const bodyBuf = body ? Buffer.from(body, 'utf8') : null;
    const finalHeaders: Record<string, string | number> = { Connection: 'close' };
    for (const [k, v] of Object.entries(headers)) {
      if (v !== undefined) finalHeaders[k] = v;
    }
    if (bodyBuf) finalHeaders['Content-Length'] = bodyBuf.length;

    const req = lib.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers: finalHeaders,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers,
          }),
        );
      },
    );
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}
