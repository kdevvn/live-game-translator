import { test, expect, chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

let server: Awaited<ReturnType<typeof createServer>>;
let origin = '';

/** Đo CER nguyên bản, tính cả chữ hoa và dấu câu để không che lỗi của engine. */
function characterError(expected: string, actual: string): number {
  let row = Array.from({ length: actual.length + 1 }, (_, i) => i);
  for (let i = 0; i < expected.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < actual.length; j++) {
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(expected[i] !== actual[j])));
    }
    row = next;
  }
  return row[actual.length] / expected.length;
}

test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: 'src/renderer',
    resolve: { alias: [{ find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' }] },
    worker: { format: 'es' },
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  origin = server.resolvedUrls?.local[0] ?? '';
});
test.afterAll(async () => {
  await server?.close();
});

for (const scene of [
  {
    file: 'atreus-scene.png',
    region: { x: 0, y: 0, width: 1394, height: 150 },
    expected: 'Atreus: That can NOT be my future. It says I serve Odin, and my father dies.',
  },
  {
    file: 'angrboda-scene.png',
    region: { x: 350, y: 505, width: 700, height: 125 },
    expected:
      "Atreus: There's just no way... Angrboda: Look, this is the only way things turn out.",
  },
]) {
  test(`PaddleOCR offline trên ảnh người dùng: ${scene.file}`, async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    const externalRequests: string[] = [];
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === `${origin}ocr-test.html`)
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>OCR test</title>',
        });
      else if (url.startsWith(origin) || url.startsWith('data:')) await route.continue();
      else {
        externalRequests.push(url);
        await route.abort();
      }
    });
    const image = (await readFile(`tests/fixtures/subtitles/${scene.file}`)).toString('base64');
    try {
      await page.goto(`${origin}ocr-test.html`).catch(() => undefined);
      const result = await page.evaluate(
        async ({ image, scene }) => {
          const path = '/features/capture/ocr.ts';
          const { createOcrEngine, readableText } = await import(/* @vite-ignore */ path);
          const img = new Image();
          img.src = `data:image/png;base64,${image}`;
          await img.decode();
          const canvas = document.createElement('canvas');
          canvas.width = scene.region.width;
          canvas.height = scene.region.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Thiếu canvas');
          const { x, y, width, height } = scene.region;
          ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
          const engine = createOcrEngine();
          try {
            const start = performance.now();
            const cold = await engine.recognize(canvas);
            const warmStart = performance.now();
            const warm = await engine.recognize(canvas);
            return {
              actual: readableText(warm),
              confidence: cold.confidence,
              coldMs: Math.round(warmStart - start),
              warmMs: Math.round(performance.now() - warmStart),
            };
          } finally {
            engine.dispose();
          }
        },
        { image, scene },
      );
      await mkdir('test-results', { recursive: true });
      const report = {
        ...result,
        expected: scene.expected,
        cer: characterError(scene.expected, result.actual),
      };
      await writeFile(`test-results/${scene.file}.json`, JSON.stringify(report, null, 2));
      expect(externalRequests).toEqual([]);
      console.log(scene.file, JSON.stringify(report));
      expect(report.cer).toBeLessThanOrEqual(0.05);
      // So sánh đủ từ, tên người nói và thứ tự; ghi riêng dấu câu engine có thể bỏ sót.
      expect(result.actual.replace(/[.,]/g, '')).toBe(scene.expected.replace(/[.,]/g, ''));
    } finally {
      await browser.close();
    }
  });
}
