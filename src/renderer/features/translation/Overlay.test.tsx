// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SessionSnapshot } from '../../../shared/types';
import { DEFAULT_PROFILE, DEFAULT_REGION, DEFAULT_SETTINGS } from '../../../shared/defaults';
import { Overlay } from './Overlay';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

const snapshot: SessionSnapshot = {
  settings: DEFAULT_SETTINGS,
  resolvedTheme: 'light',
  hasApiKey: false,
  profiles: [DEFAULT_PROFILE],
  sessions: [],
  session: null,
  status: 'idle',
  dialogues: [],
  ocrText: '',
  error: null,
  overlayEditing: true,
  overlayText: '',
  generation: 0,
  sourceId: '',
  sourceName: '',
  region: DEFAULT_REGION,
};

describe('Phụ đề nổi khi chưa có chữ', () => {
  it.each([false, true])(
    'caption trống, không chèn hướng dẫn khi đã cấu hình dịch: %s',
    (configured) => {
      const { container } = render(
        <Overlay
          snapshot={{
            ...snapshot,
            hasApiKey: configured,
            settings: { ...DEFAULT_SETTINGS, model: configured ? 'test-model' : '' },
          }}
        />,
      );
      expect(container.querySelector('.overlay-caption p')?.textContent).toBe('');
      expect(container.querySelector('.overlay-controls')).not.toBeNull();
    },
  );
  it('toàn màn hình dùng cỡ chữ riêng và không cho kéo', () => {
    const { container } = render(
      <Overlay
        snapshot={{
          ...snapshot,
          overlayEditing: true,
          overlayText: 'Hello',
          settings: { ...DEFAULT_SETTINGS, overlayFullscreen: true, overlayFullscreenFontSize: 48 },
        }}
      />,
    );
    expect(container.querySelector('.overlay-fullscreen')).not.toBeNull();
    expect(
      (container.querySelector('.overlay-fullscreen') as HTMLElement).style.backgroundColor,
    ).toContain('var(--overlay-fullscreen-bg)');
    expect((container.querySelector('.overlay-caption') as HTMLElement).style.backgroundColor).toBe(
      '',
    );
    expect((container.querySelector('.overlay-caption') as HTMLElement).style.fontSize).toBe(
      '48px',
    );
    expect(container.querySelector('.overlay-controls')).toBeNull();
  });
  it('hiện nút đóng khi di chuyển chuột và tắt toàn màn hình', () => {
    const overlayPointer = vi.fn();
    const closeFullscreenOverlay = vi.fn();
    Object.assign(window, { app: { overlayPointer, closeFullscreenOverlay } });
    const { container } = render(
      <Overlay
        snapshot={{ ...snapshot, settings: { ...DEFAULT_SETTINGS, overlayFullscreen: true } }}
      />,
    );
    fireEvent.mouseMove(container.querySelector('.overlay-fullscreen')!);
    const button = screen.getByRole('button', { name: 'translation.closeFullscreenOverlay' });
    expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(button.textContent?.trim()).toBe('');
    fireEvent.mouseEnter(button);
    expect(overlayPointer).toHaveBeenCalledWith(true);
    fireEvent.click(button);
    expect(closeFullscreenOverlay).toHaveBeenCalled();
    fireEvent.mouseLeave(button);
    expect(overlayPointer).toHaveBeenCalledWith(false);
  });
  it('ẩn nút sau 3 giây không di chuyển và hiện lại khi di chuyển', () => {
    vi.useFakeTimers();
    try {
      const overlayPointer = vi.fn();
      Object.assign(window, { app: { overlayPointer } });
      const { container } = render(
        <Overlay
          snapshot={{ ...snapshot, settings: { ...DEFAULT_SETTINGS, overlayFullscreen: true } }}
        />,
      );
      const overlay = container.querySelector('.overlay-fullscreen')!;
      fireEvent.mouseMove(overlay);
      fireEvent.mouseEnter(
        screen.getByRole('button', { name: 'translation.closeFullscreenOverlay' }),
      );
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      fireEvent.mouseMove(overlay);
      act(() => {
        vi.advanceTimersByTime(2999);
      });
      expect(
        screen.queryByRole('button', { name: 'translation.closeFullscreenOverlay' }),
      ).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(
        screen.queryByRole('button', { name: 'translation.closeFullscreenOverlay' }),
      ).toBeNull();
      expect(overlayPointer).toHaveBeenLastCalledWith(false);
      fireEvent.mouseMove(overlay);
      expect(
        screen.getByRole('button', { name: 'translation.closeFullscreenOverlay' }),
      ).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('vẫn hiển thị đúng chữ OCR khi có nội dung', () => {
    const { container } = render(
      <Overlay snapshot={{ ...snapshot, ocrText: 'Stay close.', overlayText: 'Stay close.' }} />,
    );
    expect(container.querySelector('.overlay-caption p')?.textContent).toBe('Stay close.');
  });
  it('hết hạn thì không hiện lại chữ OCR còn trong snapshot, vẫn cho chỉnh vị trí', () => {
    const { container } = render(
      <Overlay snapshot={{ ...snapshot, ocrText: 'Stay close.', overlayText: '' }} />,
    );
    expect(container.querySelector('.overlay-caption p')?.textContent).toBe('');
    expect(container.querySelector('.overlay-controls')).not.toBeNull();
  });
});
