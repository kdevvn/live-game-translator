import { describe, expect, it } from 'vitest';
import { TextStabilizer, TranslationQueue, normalizeText, isSimilarText } from './translation';
import { STABLE_TEXT_MS } from '../../shared/defaults';

describe('Chuẩn hóa và ổn định OCR', () => {
  it('so sánh Levenshtein theo ngưỡng, chỉ chuẩn hóa bản dùng để so sánh', () => {
    const source = "Atreus: I just don't understand";
    expect(isSimilarText(source, `${source}.`, 80)).toBe(true);
    expect(isSimilarText('That can NOT be my future.', '  THAT can not\nbe my future. ', 100)).toBe(
      true,
    );
    expect(isSimilarText('abcde', 'abcdf', 80)).toBe(true);
    expect(isSimilarText('abcde', 'abcdf', 81)).toBe(false);
    expect(isSimilarText('abcde', 'abcdf', 100)).toBe(false);
    expect(isSimilarText('kitten', 'sitting', 57)).toBe(true);
    expect(isSimilarText('kitten', 'sitting', 58)).toBe(false);
    expect(isSimilarText('abcdef', 'abcedf', 80)).toBe(false);
    expect(isSimilarText('same', 'same', 0)).toBe(false);
    expect(isSimilarText('', '', 80)).toBe(false);
    expect(isSimilarText('Go', 'A completely different line', 80)).toBe(false);
    expect(source).toBe("Atreus: I just don't understand");
  });
  it('dịch thủ công đánh dấu câu đã gửi để tự động không gửi lại cùng câu ngay sau đó', () => {
    const filter = new TextStabilizer(150);
    expect(filter.accept('Stay close.', 0, true)).toBe('Stay close.');
    expect(filter.accept('Stay close.', 200)).toBeNull();
    filter.accept('', 201);
    filter.accept('Stay close.', 300);
    expect(filter.accept('Stay close.', 450)).toBe('Stay close.');
  });
  it('cấu hình thực nhận câu ngắn sau 150 ms ổn định nhưng không nhận chữ đang gõ', () => {
    const filter = new TextStabilizer(STABLE_TEXT_MS);
    expect(filter.accept('Wa', 0)).toBeNull();
    expect(filter.accept('Wait!', 33)).toBeNull();
    expect(filter.accept('Wait!', 150)).toBeNull();
    expect(filter.accept('Wait!', 183)).toBe('Wait!');
  });
  it('gộp khoảng trắng, giữ nguyên dấu câu', () => {
    expect(normalizeText('  Father,\n  wait! ')).toBe('Father, wait!');
  });
  it('chờ câu ổn định và không làm mất câu xuất hiện lại sau câu khác', () => {
    const filter = new TextStabilizer(500);
    expect(filter.accept('Wait', 0)).toBeNull();
    expect(filter.accept('Wait!', 300)).toBeNull();
    expect(filter.accept('Wait!', 800)).toBe('Wait!');
    expect(filter.accept('Wait!', 1300)).toBeNull();
    filter.accept('Go!', 1400);
    expect(filter.accept('Go!', 1900)).toBe('Go!');
    filter.accept('Wait!', 2000);
    expect(filter.accept('Wait!', 2500)).toBe('Wait!');
  });
  it('khoảng trống cho phép nhận lại cùng câu khi phụ đề xuất hiện lần nữa', () => {
    const filter = new TextStabilizer(0);
    expect(filter.accept('Hello', 0)).toBe('Hello');
    filter.accept('', 1);
    expect(filter.accept('Hello', 2)).toBe('Hello');
  });
});

describe('Hàng đợi dịch', () => {
  it('chạy tuần tự, bỏ đoạn chờ cũ nhất khi đầy', async () => {
    let release: (() => void) | undefined;
    const done: string[] = [];
    const skipped: string[] = [];
    const queue = new TranslationQueue<string>(
      async (text) => {
        if (text === 'A')
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        done.push(text);
      },
      (text) => skipped.push(text),
      2,
    );
    queue.push('A');
    queue.push('B');
    queue.push('C');
    queue.push('D');
    expect(skipped).toEqual(['B']);
    release?.();
    await queue.idle();
    expect(done).toEqual(['A', 'C', 'D']);
  });
  it('hủy tín hiệu và không chạy các đoạn chờ khi đổi phiên', async () => {
    let signal: AbortSignal | undefined;
    let release: (() => void) | undefined;
    const done: string[] = [];
    const queue = new TranslationQueue<string>(
      async (text, currentSignal) => {
        signal = currentSignal;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        if (!currentSignal.aborted) done.push(text);
      },
      () => undefined,
      3,
    );
    queue.push('A');
    queue.push('B');
    queue.cancel();
    expect(signal?.aborted).toBe(true);
    release?.();
    await queue.idle();
    expect(done).toEqual([]);
  });
});
