import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import config from '../../electron.vite.config';

test('chạy source: capture thoát bước chuẩn bị và nhận chữ qua PaddleOCR', async () => {
  test.setTimeout(120000);
  const renderer = await (typeof config.renderer === 'function'
    ? config.renderer({ command: 'serve', mode: 'development' })
    : config.renderer);
  const server = await createServer({
    ...renderer,
    configFile: false,
    root: resolve('src/renderer'),
    optimizeDeps: { ...renderer?.optimizeDeps, force: true },
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const dataDir = await mkdtemp(join(tmpdir(), 'translate-game-dev-'));
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      TRANSLATE_GAME_DATA_DIR: dataDir,
      ELECTRON_RENDERER_URL: server.resolvedUrls?.local[0] ?? '',
    },
  });
  const errors: string[] = [];
  let reloads = 0;
  try {
    await expect
      .poll(() => app.windows().some((page) => page.url().includes('role=main')))
      .toBe(true);
    const main = app.windows().find((page) => page.url().includes('role=main'));
    const capture = app.windows().find((page) => page.url().includes('role=capture'));
    if (!main || !capture) throw new Error('Thiếu cửa sổ kiểm tra');
    capture.on('pageerror', (error) => errors.push(error.message));
    capture.on('framenavigated', (frame) => {
      if (frame === capture.mainFrame()) reloads++;
    });
    capture.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('[W:onnxruntime:'))
        errors.push(message.text());
    });
    await expect(main.getByRole('heading', { name: 'Dịch cửa sổ', exact: true })).toBeVisible();
    const started = await main.evaluate(async () => {
      await window.app.testSource();
      const sources = await window.app.sources();
      if (!sources.ok) return sources;
      const source = sources.value.find((entry) => entry.name.includes('Test source'));
      if (!source) throw new Error('Thiếu nguồn thử');
      return window.app.start(source.id, { x: 0, y: 0.65, width: 1, height: 0.35 });
    });
    expect(started.ok).toBe(true);
    await expect
      .poll(
        async () => {
          const result = await main.evaluate(() => window.app.snapshot());
          return result.ok ? result.value.status : result.error;
        },
        { timeout: 15000, message: 'Source không được kẹt ở starting' },
      )
      .toBe('running');
    await expect
      .poll(
        async () => {
          const result = await main.evaluate(() => window.app.snapshot());
          return result.ok ? result.value.ocrText : '';
        },
        { timeout: 40000 },
      )
      .toMatch(/[A-Za-z]{3}/);
    expect(reloads, 'Không được reload renderer vì dependency xuất hiện muộn').toBe(0);
    expect(errors).toEqual([]);
    await main.evaluate(() => window.app.control('stop'));
    await expect
      .poll(() => capture.evaluate(() => document.querySelector('video')?.srcObject === null))
      .toBe(true);
    const restarted = await main.evaluate(async () => {
      const state = await window.app.snapshot();
      if (!state.ok) return state;
      return window.app.start(state.value.sourceId, state.value.region);
    });
    expect(restarted.ok).toBe(true);
    await expect
      .poll(
        async () => {
          const result = await main.evaluate(() => window.app.snapshot());
          return result.ok ? result.value.ocrText : '';
        },
        { timeout: 40000 },
      )
      .toMatch(/[A-Za-z]{3}/);
  } finally {
    console.log('Capture source errors:', JSON.stringify(errors));
    const main = app.windows().find((page) => page.url().includes('role=main'));
    if (main) await main.evaluate(() => window.app.control('stop')).catch(() => undefined);
    const capture = app.windows().find((page) => page.url().includes('role=capture'));
    if (capture)
      await expect
        .poll(() => capture.evaluate(() => document.querySelector('video')?.srcObject === null))
        .toBe(true);
    if (capture)
      console.log(
        'Capture source state:',
        await capture
          .evaluate(() => ({
            video: Boolean(document.querySelector('video')),
            visibility: document.visibilityState,
            width: document.querySelector('video')?.videoWidth,
            ready: document.querySelector('video')?.readyState,
            url: location.href,
          }))
          .catch(() => null),
      );
    // Playwright tự gọi app.quit và ngắt Node inspector trong app.close.
    // Gọi app.quit trước khiến lệnh quit thứ hai chờ trên runtime đang thoát.
    await app.close();
    await server.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
