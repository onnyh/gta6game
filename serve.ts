// Bayu Heat — tiny local development server.
//
// Serves this repository's game/ folder over HTTP so the game can be played
// and screenshotted in a desktop browser exactly as the finalist review will
// serve it: plain static files, no build step, no network beyond localhost.
//
// Usage:  node serve.ts            (port 8137, or $PORT when set)

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const gameRoot = join(dirname(fileURLToPath(import.meta.url)), "game");
const port = Number(process.env.PORT ?? 8137);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    // Keep every request inside game/: normalise and refuse escapes.
    const filePath = normalize(join(gameRoot, path));
    if (filePath !== gameRoot && !filePath.startsWith(gameRoot + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    // Directories other than the root are not listable content here.
    const info = await stat(filePath).catch(() => null);
    if (!info || info.isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Bayu Heat dev server: http://localhost:${port}/ (serving ${gameRoot})`);
});
