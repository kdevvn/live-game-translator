const MIN_TEXT_LENGTH = 4;

/** Kiểm tra câu OCR đủ dài theo code point và có chữ Unicode trước khi gọi AI hoặc lưu hội thoại. */
export function isTranslatableText(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return Array.from(normalized).length >= MIN_TEXT_LENGTH && /\p{L}/u.test(normalized);
}
