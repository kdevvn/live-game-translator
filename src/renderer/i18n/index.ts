import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './vi.json';
import en from './en.json';

/** Khởi tạo tài nguyên cục bộ, mặc định Việt độc lập ngôn ngữ Windows. */
export async function initializeI18n(locale = 'vi'): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources: { vi: { translation: vi }, en: { translation: en } },
    lng: locale,
    fallbackLng: 'vi',
    interpolation: { escapeValue: false },
    returnNull: false,
    showSupportNotice: false,
  });
}
export { i18n };
