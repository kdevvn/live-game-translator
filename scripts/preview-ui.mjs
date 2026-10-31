import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('out/renderer');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
};
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    if (path === '/preview-bridge.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(await readFile('tests/visual/bridge.mjs'));
      return;
    }
    const file = resolve(root, `.${decodeURIComponent(path)}`);
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    let data = await readFile(file);
    if (path === '/index.html')
      data = Buffer.from(
        data.toString().replace('<head>', '<head><script src="/preview-bridge.js"></script>'),
      );
    response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
    response.end(data);
  } catch {
    response.writeHead(404).end();
  }
}).listen(4173, '127.0.0.1', () =>
  console.log('UI preview với bridge giả lập: http://127.0.0.1:4173'),
);
