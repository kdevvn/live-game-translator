import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

const sentences = [
  'Father, the gate is open.',
  'Stay close to me, son.',
  'We must leave before dawn.',
  'Do you remember your promise?',
  'I will not leave you behind.',
  'Someone is waiting at the tower.',
  'Take the key and unlock the door.',
  'There is no turning back now.',
  'Keep your voice down.',
  'The northern road is dangerous.',
  'You have my word.',
  'Meet me by the old bridge.',
  'This is where our journey begins.',
  'I thought you were gone.',
  'Trust me, I know the way.',
  'We should speak to the captain.',
  'Watch out for the guards.',
  'The village needs our help.',
  'What happened to your brother?',
  'Nothing is as it seems.',
  'Bring the medicine to the camp.',
  'The storm will pass soon.',
  'Please forgive me, my friend.',
  'Our supplies are running low.',
  'I found something in the ruins.',
  'You cannot fight them alone.',
  'Let us rest here for a while.',
  'Follow the river to the east.',
  'Your courage will be remembered.',
  'We still have a chance.',
];
/** Tính khoảng cách chỉnh sửa ký tự bằng quy hoạch động. */
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++)
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(a[i] !== b[j])));
    row = next;
  }
  return row[b.length];
}
const folder = 'tests/fixtures/ocr';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const server = await createServer({
  configFile: false,
  root: 'src/renderer',
  resolve: { alias: [{ find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' }] },
  worker: { format: 'es' },
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const origin = server.resolvedUrls.local[0];
await page.route(`${origin}ocr-test.html`, (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>OCR benchmark</title>' }),
);
await page.goto(`${origin}ocr-test.html`);
await page.evaluate(async () => {
  const { createOcrEngine } = await import('/features/capture/ocr.ts');
  window.benchmarkOcr = createOcrEngine();
});
const results = [];
try {
  for (const [index, text] of sentences.entries()) {
    for (const kind of ['clear', 'difficult']) {
      const data = await page.evaluate(
        ({ text, kind, index }) => {
          const canvas = document.createElement('canvas');
          canvas.width = 1100;
          canvas.height = 130;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = kind === 'clear' ? '#111111' : '#536347';
          ctx.fillRect(0, 0, 1100, 130);
          if (kind === 'difficult') {
            for (let i = 0; i < 25; i++) {
              ctx.fillStyle = i % 2 ? '#4e5d42' : '#66744f';
              ctx.fillRect(i * 47, (i * 17) % 90, 80, 35);
            }
          }
          ctx.font = `${kind === 'clear' ? 32 : 23}px ${kind === 'clear' ? 'Arial' : 'Georgia'}`;
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, 24, 65 + (index % 3));
          return canvas.toDataURL('image/png').split(',')[1];
        },
        { text, kind, index },
      );
      const file = `${folder}/${kind}-${String(index + 1).padStart(2, '0')}.png`;
      const image = Buffer.from(data, 'base64');
      await writeFile(file, image);
      const start = performance.now();
      const actual = await page.evaluate(async (data) => {
        const image = new window.Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        const result = await window.benchmarkOcr.recognize(canvas);
        return result.text.replace(/\s+/g, ' ').trim();
      }, data);
      results.push({
        file,
        kind,
        expected: text,
        actual,
        cer: distance(text, actual) / text.length,
        ms: Math.round(performance.now() - start),
      });
    }
  }
} finally {
  await page.evaluate(() => window.benchmarkOcr.dispose()).catch(() => undefined);
  await browser.close();
  await server.close();
}
const summary = Object.fromEntries(
  ['clear', 'difficult'].map((kind) => {
    const rows = results.filter((r) => r.kind === kind);
    return [
      kind,
      {
        count: rows.length,
        meanCer: rows.reduce((s, r) => s + r.cer, 0) / rows.length,
        meanMs: rows.reduce((s, r) => s + r.ms, 0) / rows.length,
      },
    ];
  }),
);
await writeFile(
  `${folder}/manifest.json`,
  JSON.stringify(
    results.map(({ file, expected, kind }) => ({ file, expected, kind })),
    null,
    2,
  ),
);
await writeFile(
  'docs/OCR_BENCHMARK.json',
  JSON.stringify(
    {
      generated: true,
      engine: 'PaddleOCR PP-OCRv5 mobile det + en mobile rec, ONNX WASM',
      description: 'Ảnh phụ đề tổng hợp, chưa đại diện mọi font/game thật.',
      summary,
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(summary, null, 2));
if (summary.clear.meanCer > 0.1) process.exitCode = 1;
