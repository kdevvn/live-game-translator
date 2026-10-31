import { describe, expect, it } from 'vitest';
import vi from './vi.json';
import en from './en.json';
import { i18n, initializeI18n } from './index';

/** Liệt kê key cuối để phát hiện bản dịch thiếu ở mọi cấp. */
function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'string' ? [`${prefix}${key}`] : keys(child as object, `${prefix}${key}.`),
  );
}
describe('Đa ngôn ngữ', () => {
  it('hai locale có đầy đủ cùng bộ key', () => {
    expect(keys(vi).sort()).toEqual(keys(en).sort());
  });
  it('mặc định Việt và fallback Việt khi locale không hỗ trợ', async () => {
    await initializeI18n();
    expect(i18n.t('nav.settings')).toBe('Cài đặt');
    await i18n.changeLanguage('fr');
    expect(i18n.t('nav.settings')).toBe('Cài đặt');
    await i18n.changeLanguage('en');
    expect(i18n.t('nav.settings')).toBe('Settings');
  });
});
