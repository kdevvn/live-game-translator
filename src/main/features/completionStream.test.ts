import { describe, expect, it } from 'vitest';
import { translationPreview } from './completionStream';

describe('Bản nháp JSON streaming', () => {
  it('nhận translation ở mọi thứ tự trường, không nhầm chữ trong giá trị người nói là key', () => {
    expect(translationPreview('{"speaker":"Atreus","listener":"unknown","translation":"Chào')).toBe(
      'Chào',
    );
    expect(translationPreview('{"speaker":"\\"translation\\":\\"nhiễu","translation":"Đúng')).toBe(
      'Đúng',
    );
    expect(translationPreview('{"speaker":"translation","listener":"x"}')).toBe('');
    expect(translationPreview('{"other":{"translation":"không phải bản dịch"}}')).toBe('');
  });
  it('không hiển thị JSON hoặc escape Unicode chưa nhận đủ', () => {
    expect(translationPreview('{"translation":"Chào \\u00')).toBe('Chào ');
    expect(translationPreview('{"translation":"Chào \\u00f4')).toBe('Chào ô');
    expect(translationPreview('{"translation":"Nói \\"đi\\".')).toBe('Nói "đi".');
    expect(translationPreview('{"translation":"Hello\\')).toBe('Hello');
    expect(translationPreview('{"speaker":"translation","listener":"x"}')).toBe('');
    expect(translationPreview('{"translation": null}')).toBe('');
  });
});
