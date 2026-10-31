// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOcrEngine, readOcrLines, readableText } from './ocr';
import type { OcrLine } from './ocr';

/** Tạo dòng nhận dạng thử có tọa độ và điểm tin cậy thực theo hợp đồng PaddleOCR. */
function line(text: string, y: number, score = 0.95): OcrLine {
  return {
    text,
    score,
    poly: [
      [0, y],
      [300, y],
      [300, y + 20],
      [0, y + 20],
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('PaddleOCR cục bộ', () => {
  it('giữ cả hai người nói theo thứ tự dòng và dấu câu từ engine', () => {
    const result = readOcrLines([
      line('Angrboda: Look, this is the only way things turn out.', 80),
      line("Atreus: There's just no way...", 30),
      line('nhiễu nền', 100, 0.3),
    ]);
    expect(readableText(result)).toBe(
      "Atreus: There's just no way... Angrboda: Look, this is the only way things turn out.",
    );
  });

  it('không đưa dòng rỗng hoặc điểm không hợp lệ vào kết quả', () => {
    expect(readOcrLines([line('', 0), line('noise', 0, NaN)]).text).toBe('');
    expect(readableText({ text: 'noise', confidence: 23 })).toBe('');
    expect(readableText(readOcrLines([]))).toBe('');
  });

  it('dừng hủy OCR đang chạy và giải phóng worker ngay, không tăng kích thước crop', async () => {
    const terminate = vi.fn();
    const postMessage = vi.fn();
    vi.stubGlobal(
      'Worker',
      class {
        terminate = terminate;
        postMessage = postMessage;
      },
    );
    const pixels = { data: new Uint8ClampedArray(640 * 80 * 4), width: 640, height: 80 };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      getImageData: () => pixels,
    } as unknown as CanvasRenderingContext2D);
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 80;
    const engine = createOcrEngine();
    const reading = engine.recognize(canvas);
    const rejected = expect(reading).rejects.toThrow('OCR');
    expect(postMessage.mock.calls[0][0].image).toBe(pixels);
    engine.dispose();
    await rejected;
    expect(terminate).toHaveBeenCalledTimes(1);
    await expect(engine.recognize(canvas)).rejects.toThrow('OCR');
  });
});
