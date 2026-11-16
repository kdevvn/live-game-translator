import { describe, expect, it } from 'vitest';
import { translationPreview, speakerPreview } from './completionStream';

describe('Bản nháp JSON streaming', () => {
  it('nhận tên hoàn chỉnh trước lời thoại, không tô tên bị cắt hoặc dữ liệu lồng trong chuỗi', () => {
    expect(speakerPreview('{"speaker":"Arth')).toBeUndefined();
    expect(speakerPreview('{"speaker":"Arthur","translation":"cậu')).toBe('Arthur');
    expect(speakerPreview('{"translation":"cậu biết mà.","speaker":"Arthur"')).toBe('Arthur');
    expect(speakerPreview('{"translation":"\\"speaker\\":\\"sai\\"')).toBeUndefined();
    expect(speakerPreview('{"other":{"speaker":"sai"}}')).toBeUndefined();
    expect(speakerPreview(`{"speaker":"${'a'.repeat(101)}"`)).toBeUndefined();
  });
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
