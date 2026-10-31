import { describe, expect, it } from 'vitest';
import { isTranslatableText } from './ocrFilter';

describe('Lọc câu OCR trước khi dịch', () => {
  it.each(['Hi', 'a12', '123', '12@', '^%&*%$', '1234671524', '  a12\n', '😀😀a'])(
    'bỏ %s',
    (text) => {
      expect(isTranslatableText(text)).toBe(false);
    },
  );
  it.each(['123a', '123$s', 'Hello', 'こんにちは', '你好世界', '  Hi!\nthere  '])(
    'giữ %s',
    (text) => {
      expect(isTranslatableText(text)).toBe(true);
    },
  );
});
