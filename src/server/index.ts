import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { loadEnvFile } from 'node:process';
import type { ViteDevServer } from 'vite';

try { loadEnvFile(); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const production = import.meta.url.endsWith('/dist/server/index.js');
const root = resolve('dist/client');
const pages: Record<string, string> = {
  '/': '/host/index.html',
  '/host': '/host/index.html',
  '/overlay': '/overlay/index.html',
  '/episode': '/episode/index.html',
  '/demo': '/demo/index.html'
};
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav'
};

let vite: ViteDevServer | undefined;
const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const url = new URL(request.url ?? '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname).replace(/\/$/, '') || '/';
    const page = pages[pathname] ?? (/^\/episode\/[^/]+$/.test(pathname) ? pages['/episode'] : undefined);
    if (vite) {
      if (page) request.url = page + url.search;
      vite.middlewares(request, response, () => response.writeHead(404).end('Not found'));
      return;
    }
    const file = resolve(root, '.' + (page ?? pathname));
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    response.writeHead(error instanceof URIError ? 400 : code === 'ENOENT' ? 404 : 500).end();
  }
});

if (!production) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ server: { middlewareMode: true, hmr: { server } } });
}

const port = Number(process.env.PORT ?? 3000);
server.listen(port, '127.0.0.1', () => console.log(`THE NARRATOR: http://localhost:${port}/host`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => { process.exitCode = 0; });
    server.closeAllConnections();
    void vite?.close();
  });
}
