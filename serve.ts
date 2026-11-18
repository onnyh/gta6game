// A small static file server for developing Coral Bay Heat: it serves this repository's game/
// folder on a local port so the game can be played and screenshotted in a desktop browser.
//   node serve.ts            -> http://localhost:8123
//   node serve.ts --port 9000
// Standard library only; it refuses paths that climb out of game/ and adds no caching, so what
// you see is always the file on disk.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game/', import.meta.url)));

const argv = process.argv.slice(2);
const portFlag = argv.indexOf('--port');
const wanted = portFlag >= 0 ? Number(argv[portFlag + 1]) : 8123;
const port = Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8123;

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.wasm', 'application/wasm'],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = resolve(join(gameRoot, normalize(pathname)));
    if (target !== gameRoot && !target.startsWith(gameRoot + sep)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    const info = await stat(target);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': CONTENT_TYPES.get(extname(target).toLowerCase()) ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Coral Bay Heat dev server: http://localhost:${port}`);
});
