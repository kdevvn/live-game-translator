import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: vi.fn(), nativeTheme: {}, screen: {} }));

import { updateOverlayVisibility } from './windows';

describe('Vòng đời hiển thị cửa sổ phụ đề', () => {
  it('nhiều cập nhật OCR và bản nháp chỉ hiện hoặc ẩn cửa sổ khi trạng thái thay đổi', () => {
    let visible = false;
    const window = {
      isDestroyed: () => false,
      isVisible: () => visible,
      showInactive: vi.fn(() => {
        visible = true;
      }),
      hide: vi.fn(() => {
        visible = false;
      }),
    };

    for (let i = 0; i < 100; i++) updateOverlayVisibility(window, false);
    expect(visible).toBe(false);
    expect(window.hide).not.toHaveBeenCalled();

    for (let i = 0; i < 100; i++) updateOverlayVisibility(window, true);
    expect(visible).toBe(true);
    expect(window.showInactive).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 100; i++) updateOverlayVisibility(window, false);
    expect(visible).toBe(false);
    expect(window.hide).toHaveBeenCalledTimes(1);

    updateOverlayVisibility(window, true);
    expect(visible).toBe(true);
    expect(window.showInactive).toHaveBeenCalledTimes(2);
  });

  it('không truy cập trạng thái hoặc điều khiển cửa sổ đã đóng', () => {
    const window = {
      isDestroyed: () => true,
      isVisible: vi.fn(),
      showInactive: vi.fn(),
      hide: vi.fn(),
    };

    updateOverlayVisibility(window, true);
    updateOverlayVisibility(window, false);
    expect(window.isVisible).not.toHaveBeenCalled();
    expect(window.showInactive).not.toHaveBeenCalled();
    expect(window.hide).not.toHaveBeenCalled();
  });
});
