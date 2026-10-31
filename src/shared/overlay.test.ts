import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { getOverlayText, shouldShowOverlay } from './overlay';
import type { Dialogue } from './types';

describe('Nội dung phụ đề nổi', () => {
  const state = {
    settings: DEFAULT_SETTINGS,
    hasApiKey: false,
    ocrText: 'Stay close.',
    dialogues: [],
  };
  const translated: Dialogue = {
    id: 'd1',
    sessionId: 's1',
    sequence: 1,
    text: 'Old text.',
    translation: 'Câu dịch cũ.',
    speaker: 'unknown',
    listener: 'unknown',
    status: 'translated',
    createdAt: 0,
    ocrMs: 0,
    apiMs: 0,
  };
  it('toàn màn hình vẫn hiện khi không có chữ và không chỉnh', () => {
    expect(
      shouldShowOverlay({
        settings: { ...DEFAULT_SETTINGS, overlayFullscreen: true },
        overlayEditing: false,
        overlayText: '',
      }),
    ).toBe(true);
    expect(
      shouldShowOverlay({ settings: DEFAULT_SETTINGS, overlayEditing: false, overlayText: '' }),
    ).toBe(false);
  });
  it('có cấu hình dịch thì giữ bản dịch mới nhất, bỏ qua đoạn chưa dịch', () => {
    expect(
      getOverlayText({
        ...state,
        hasApiKey: true,
        settings: { ...DEFAULT_SETTINGS, model: 'test-model' },
        dialogues: [translated, { ...translated, id: 'd2', status: 'pending', translation: '' }],
      }),
    ).toBe('Câu dịch cũ.');
  });
  it('hiện chữ đang stream sớm, không đợi JSON và người nói hoàn tất', () => {
    expect(
      getOverlayText({
        ...state,
        hasApiKey: true,
        settings: { ...DEFAULT_SETTINGS, model: 'test-model' },
        dialogues: [
          translated,
          { ...translated, id: 'd2', sequence: 2, status: 'pending', translation: 'Đi cùng' },
        ],
      }),
    ).toBe('Đi cùng');
  });
  it('xóa key thì dùng OCR hiện tại, không giữ bản dịch cũ trên overlay', () => {
    expect(getOverlayText({ ...state, dialogues: [translated] })).toBe('Stay close.');
  });
  it('chưa có API key thì hiển thị OCR ngay, không cần hội thoại đã dịch', () => {
    expect(getOverlayText(state)).toBe('Stay close.');
  });
  it('đã có key nhưng chưa chọn model vẫn hiển thị OCR', () => {
    expect(getOverlayText({ ...state, hasApiKey: true })).toBe('Stay close.');
  });
  it('đã cấu hình dịch thì không coi chữ OCR là bản dịch', () => {
    expect(
      getOverlayText({
        ...state,
        hasApiKey: true,
        settings: { ...DEFAULT_SETTINGS, model: 'test-model' },
      }),
    ).toBe('');
  });
  it('OCR rỗng thì xóa caption cũ trong chế độ chưa cấu hình dịch', () => {
    expect(getOverlayText({ ...state, ocrText: '' })).toBe('');
  });
});
