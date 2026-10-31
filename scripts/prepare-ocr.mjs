import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const destination = 'src/renderer/public/ocr/paddle';
const modelBase =
  'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/';
const models = [
  {
    name: 'PP-OCRv5_mobile_det',
    sha256: '781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30',
  },
  {
    name: 'en_PP-OCRv5_mobile_rec',
    sha256: '4424e851309b291b00aab8191cd4314cefbd2d1b2381ff8994019d262fa95e28',
  },
];

/** Kiểm tra model bằng SHA-256 để tránh dùng file thiếu hoặc tài nguyên đã thay đổi. */
function checksum(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

await mkdir(destination, { recursive: true });
const runtime = dirname(require.resolve('onnxruntime-web'));
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  await cp(join(runtime, name), join(destination, name));
}
for (const model of models) {
  const file = join(destination, `${model.name}.tar`);
  const existing = await readFile(file).catch(() => null);
  if (existing && checksum(existing) === model.sha256) continue;
  console.log(`Đang tải model ${model.name} từ PaddleOCR chính thức…`);
  const response = await globalThis.fetch(`${modelBase}${model.name}_onnx_infer.tar`, {
    signal: globalThis.AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Tải model thất bại: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (checksum(bytes) !== model.sha256) throw new Error(`Model ${model.name} sai SHA-256`);
  const partial = `${file}.partial`;
  await writeFile(partial, bytes);
  await rename(partial, file);
}
console.log('Đã chuẩn bị PaddleOCR tiếng Anh và ONNX WASM cục bộ.');
