/** Dòng do PaddleOCR nhận trực tiếp trên ảnh vùng chọn, điểm tin cậy trong khoảng 0-1. */
export interface OcrLine {
  text: string;
  score: number;
  poly: number[][];
}

/** Kết quả OCR chuẩn hóa cho pipeline capture; confidence dùng thang 0-100. */
export interface OcrReading {
  text: string;
  confidence: number;
}

/** Engine cục bộ có một worker tái sử dụng và giải phóng ngay khi dừng phiên. */
export interface OcrEngine {
  recognize(source: HTMLCanvasElement): Promise<OcrReading>;
  dispose(): void;
}

/** Thông điệp phản hồi nội bộ từ worker PaddleOCR. */
export type OcrResponse = { id: number; reading: OcrReading } | { id: number; error: true };

const MIN_LINE_SCORE = 0.6;
const MIN_CONFIDENCE = MIN_LINE_SCORE * 100;
const WORKER_TIMEOUT_MS = 60000;

/** Giữ mọi dòng đủ rõ theo thứ tự đọc, không suy đoán hoặc sửa chữ từ ngữ cảnh. */
export function readOcrLines(lines: OcrLine[]): OcrReading {
  const selected = lines
    .filter(
      (line) => Number.isFinite(line.score) && line.score >= MIN_LINE_SCORE && line.text.trim(),
    )
    .sort((a, b) => (a.poly[0]?.[1] ?? 0) - (b.poly[0]?.[1] ?? 0));
  const length = selected.reduce((sum, line) => sum + line.text.length, 0);
  return {
    text: selected.map((line) => line.text.trim()).join(' '),
    confidence: length
      ? (selected.reduce((sum, line) => sum + line.score * line.text.length, 0) / length) * 100
      : 0,
  };
}

/** Chọn văn bản đủ tin cậy để chuyển sang phiên dịch; không sửa nội dung nhận dạng. */
export function readableText(reading: OcrReading): string {
  return Number.isFinite(reading.confidence) && reading.confidence >= MIN_CONFIDENCE
    ? reading.text.replace(/\s+/g, ' ').trim()
    : '';
}

/**
 * Tạo worker PaddleOCR độc lập; truyền đúng pixel crop gốc, không phóng lớn ảnh.
 * Dừng/timeout/lỗi worker hủy tất cả lời gọi đang chờ, không để callback của phiên cũ tồn tại.
 */
export function createOcrEngine(): OcrEngine {
  const worker = new Worker(new URL('./paddle.worker.ts', import.meta.url), { type: 'module' });
  let sequence = 0;
  let disposed = false;
  const pending = new Map<
    number,
    {
      resolve: (reading: OcrReading) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  /** Kết thúc worker ngay, kể cả khi đang khởi tạo model hoặc chạy inference. */
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    worker.terminate();
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error('OCR'));
    }
    pending.clear();
  }
  worker.onerror = dispose;
  worker.onmessageerror = dispose;
  worker.onmessage = (event: MessageEvent<OcrResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(response.id);
    if ('error' in response) {
      request.reject(new Error('OCR'));
      dispose();
    } else request.resolve(response.reading);
  };
  return {
    dispose,
    /** Chuyển pixel RGBA của crop sang worker; từ chối nếu lượt trước chưa kết thúc. */
    recognize(source) {
      if (disposed || pending.size) return Promise.reject(new Error('OCR'));
      const context = source.getContext('2d');
      if (!context) return Promise.reject(new Error('OCR'));
      const image = context.getImageData(0, 0, source.width, source.height);
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, timeout: setTimeout(dispose, WORKER_TIMEOUT_MS) });
        try {
          worker.postMessage({ id, image, base: new URL('./ocr/paddle/', location.href).href }, [
            image.data.buffer,
          ]);
        } catch {
          dispose();
        }
      });
    },
  };
}
