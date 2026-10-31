/// <reference lib="webworker" />
import { PaddleOCR } from '@paddleocr/paddleocr-js';
import cvModule from '@techstark/opencv-js';
import { readOcrLines } from './ocr';
import type { OcrResponse } from './ocr';

const DETECTION_MODEL = 'PP-OCRv5_mobile_det';
const RECOGNITION_MODEL = 'en_PP-OCRv5_mobile_rec';
const DETECTION_MAX_SIDE = 1600;
let engine: ReturnType<typeof PaddleOCR.create> | undefined;

/** Yêu cầu OCR nội bộ, chỉ chứa pixel crop và đường dẫn tài nguyên của ứng dụng. */
interface OcrRequest {
  id: number;
  image: ImageData;
  base: string;
}

/** Khởi tạo model một lần trong worker; ảnh và text không được gửi ra mạng. */
async function recognize({ id, image, base }: OcrRequest): Promise<void> {
  try {
    engine ??= PaddleOCR.create({
      textDetectionModelName: DETECTION_MODEL,
      textDetectionModelAsset: { url: `${base}${DETECTION_MODEL}.tar` },
      textRecognitionModelName: RECOGNITION_MODEL,
      textRecognitionModelAsset: { url: `${base}${RECOGNITION_MODEL}.tar` },
      textRecognitionBatchSize: 1,
      ortOptions: { backend: 'wasm', wasmPaths: base, numThreads: 1, proxy: false },
    });
    const ocr = await engine;
    // OpenCV cũ là thenable tự trả chính nó; không await trực tiếp sau khi SDK đã khởi tạo.
    const cv = cvModule instanceof Promise ? await cvModule : cvModule;
    const mat = cv.matFromImageData(image);
    try {
      const [result] = await ocr.predict(mat, {
        textDetLimitType: 'max',
        textDetLimitSideLen: Math.min(DETECTION_MAX_SIDE, Math.max(image.width, image.height)),
      });
      const response: OcrResponse = { id, reading: readOcrLines(result?.items ?? []) };
      self.postMessage(response);
    } finally {
      mat.delete();
    }
  } catch {
    const response: OcrResponse = { id, error: true };
    self.postMessage(response);
  }
}

self.onmessage = (event: MessageEvent<OcrRequest>) => void recognize(event.data);
