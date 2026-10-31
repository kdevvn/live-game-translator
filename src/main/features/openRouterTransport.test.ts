import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { createOpenRouterTransport } from './openRouterTransport';
import { readCompletionStream } from './completionStream';

/** Server loopback đếm TCP thật, không dùng key hoặc gọi OpenRouter. */
async function localServer(handler: (response: ServerResponse) => void) {
  const sockets = new Set<Socket>();
  let connections = 0;
  const server = createServer((_request, response) => handler(response));
  server.keepAliveTimeout = 60000;
  server.on('connection', (socket) => {
    connections++;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Thiếu địa chỉ loopback');
  return {
    url: `http://127.0.0.1:${address.port}`,
    sockets,
    connections: () => connections,
    /** Đóng socket test kể cả khi assertion thất bại để không treo worker. */
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

describe('Kết nối Keep-Alive của OpenRouter', () => {
  it('pool nền hết socket không chặn pool dịch riêng', async () => {
    let requests = 0;
    const server = await localServer((response) => {
      requests++;
      if (requests <= 2) {
        response.writeHead(200);
        response.write('waiting');
      } else response.end('translated');
    });
    const background = createOpenRouterTransport();
    const translation = createOpenRouterTransport();
    try {
      const first = await background.fetch(server.url);
      const second = await background.fetch(server.url);
      const response = await translation.fetch(server.url);
      expect(await response.text()).toBe('translated');
      expect(server.connections()).toBe(3);
      await first.body?.cancel();
      await second.body?.cancel();
    } finally {
      await Promise.all([background.dispose(), translation.dispose()]);
      await server.close();
    }
  });
  it('tái sử dụng tối đa hai TCP socket cho năm response JSON liên tiếp', async () => {
    const server = await localServer((response) => response.end('{"ok":true}'));
    const transport = createOpenRouterTransport();
    try {
      for (let i = 0; i < 5; i++) {
        const response = await transport.fetch(server.url);
        expect(await response.json()).toEqual({ ok: true });
      }
      expect(server.connections()).toBeLessThanOrEqual(2);
      await transport.dispose();
      await vi.waitFor(() => expect(server.sockets.size).toBe(0));
    } finally {
      await transport.dispose();
      await server.close();
    }
  });

  it('đọc hết HTTP body sau DONE để SSE không phá socket ở mỗi lần dịch', async () => {
    const server = await localServer((response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Chào.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
      );
      // Mô phỏng HTTP kết thúc sau event DONE; không dùng sleep để đợi assertion.
      setTimeout(() => response.end(': complete\n\n'), 25);
    });
    const transport = createOpenRouterTransport();
    try {
      for (let i = 0; i < 5; i++) {
        const response = await transport.fetch(server.url);
        expect((await readCompletionStream(response, new AbortController().signal)).content).toBe(
          'Chào.',
        );
      }
      expect(server.connections()).toBeLessThanOrEqual(2);
    } finally {
      await transport.dispose();
      await server.close();
    }
  });

  it('dispose hủy body đang chờ, đóng socket và không cho tạo kết nối mới', async () => {
    const server = await localServer((response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(': waiting\n\n');
    });
    const transport = createOpenRouterTransport();
    try {
      const response = await transport.fetch(server.url);
      const body = response.text();
      const rejected = expect(body).rejects.toThrow();
      await transport.dispose();
      await rejected;
      await transport.dispose();
      await vi.waitFor(() => expect(server.sockets.size).toBe(0));
      await expect(transport.fetch(server.url)).rejects.toThrow();
    } finally {
      await transport.dispose();
      await server.close();
    }
  });
});
