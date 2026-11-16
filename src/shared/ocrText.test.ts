import { describe, expect, it } from 'vitest';
import { normalizeOcrText } from './ocrText';

describe('Ghép dòng OCR theo kiểu tên', () => {
  const text = '  Dutch  \r\n They may be okay,\r\n\r\n we  don’t know. ';
  it.each(['inline', 'none'] as const)('%s nối toàn bộ bằng dấu cách', (mode) => {
    expect(normalizeOcrText(text, mode)).toBe('Dutch They may be okay, we don’t know.');
  });
  it('dòng riêng chỉ giữ ngắt sau tên, lời thoại còn lại thành một dòng', () => {
    expect(normalizeOcrText(text, 'separateLine')).toBe('Dutch\nThey may be okay, we don’t know.');
    expect(normalizeOcrText('Dutch', 'separateLine')).toBe('Dutch');
    expect(normalizeOcrText(' \r\n ', 'separateLine')).toBe('');
  });
  it('worker chưa biết hồ sơ vẫn giữ bố cục cho main xử lý', () => {
    expect(normalizeOcrText(text)).toBe('Dutch\nThey may be okay,\nwe don’t know.');
  });
});
