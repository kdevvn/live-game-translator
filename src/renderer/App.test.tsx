// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PROFILE, DEFAULT_REGION, DEFAULT_SETTINGS } from '../shared/defaults';
import type { SessionSnapshot } from '../shared/types';
import { App } from './App';

vi.mock('./features/translation/Translation', () => ({ Translation: () => <h1>workspace</h1> }));
vi.mock('./features/context/Context', () => ({ Context: () => <h1>profiles</h1> }));
vi.mock('./features/settings/Settings', () => ({ Settings: () => <h1>settings</h1> }));
const language = { changeLanguage: vi.fn().mockResolvedValue(undefined) };
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: language }),
}));

/** Tạo trạng thái công khai để kiểm tra shell mà không mở Electron hoặc gọi mạng. */
function snapshot(status: SessionSnapshot['status'] = 'idle'): SessionSnapshot {
  return {
    settings: DEFAULT_SETTINGS,
    resolvedTheme: 'dark',
    hasApiKey: true,
    profiles: [DEFAULT_PROFILE],
    sessions: [],
    session: null,
    status,
    dialogues: [],
    ocrText: '',
    error: null,
    overlayEditing: false,
    overlayText: '',
    generation: 0,
    sourceId: '',
    sourceName: '',
    region: DEFAULT_REGION,
  };
}

beforeEach(() => {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
  window.app = {
    snapshot: vi.fn().mockResolvedValue({ ok: true, value: snapshot() }),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    control: vi.fn().mockResolvedValue({ ok: true }),
    overlay: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as typeof window.app;
});
afterEach(cleanup);

describe('Shell desktop và bảng lệnh', () => {
  it('thông báo trạng thái phiên cho công nghệ hỗ trợ', () => {
    render(<App initial={snapshot('running')} />);
    expect(screen.getByRole('status').textContent).toContain('status.running');
  });
  it('chỉ hiện tab nhật ký khi main bật debug', async () => {
    window.app.debugLogs = vi.fn().mockResolvedValue({ ok: true, value: [] });
    window.app.onDebugLogs = vi.fn().mockReturnValue(vi.fn());
    window.app.clearDebugLogs = vi.fn().mockResolvedValue({ ok: true });
    render(<App initial={snapshot()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'nav.debug' }));
    expect(screen.getByRole('heading', { name: 'debug.title' })).toBeTruthy();
  });
  it('chuyển màn hình đưa vùng làm việc về đầu để thấy tiêu đề và nút chính', () => {
    const { container } = render(<App initial={snapshot()} />);
    const frame = container.querySelector('.main-frame');
    if (!(frame instanceof HTMLElement)) throw new Error('Thiếu vùng làm việc');
    frame.scrollTop = 240;
    fireEvent.click(screen.getByRole('button', { name: 'nav.settings' }));
    expect(frame.scrollTop).toBe(0);
  });
  it('mở bằng Ctrl+K, lọc lệnh và Enter chuyển màn hình', async () => {
    render(<App initial={snapshot()} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const search = screen.getByRole('combobox', { name: 'commands.search' });
    fireEvent.change(search, { target: { value: 'nav.settings' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'settings' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
  });

  it('không cho chạy lệnh dịch và tạm dừng khi chưa có phiên chạy', () => {
    render(<App initial={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: 'commands.open' }));
    expect(
      screen.getByRole('option', { name: /translation.manual/ }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByRole('option', { name: /capture.pause/ }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('Escape đóng bảng lệnh và trả focus về nút mở', async () => {
    render(<App initial={snapshot()} />);
    const trigger = screen.getByRole('button', { name: 'commands.open' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('phím mũi tên chọn lệnh kế tiếp và báo khi không có kết quả', async () => {
    render(<App initial={snapshot()} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const search = screen.getByRole('combobox');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'profiles' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'khongtimthay' } });
    expect(screen.getByText('commands.empty')).toBeTruthy();
  });
});
