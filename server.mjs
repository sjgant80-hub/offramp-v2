// server.mjs — dev-only static server with correct MIME types (so .mjs loads as a module).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = normalize(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const PORT = process.env.PORT || 8851;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.css': 'text/css' };
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('no'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('404'); }
}).listen(PORT, () => console.log(`the-toll on http://localhost:${PORT}`));
