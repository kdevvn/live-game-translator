// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Context } from './Context';
import { DEFAULT_PROFILE, DEFAULT_REGION, DEFAULT_SETTINGS } from '../../../shared/defaults';
import type { SessionSnapshot } from '../../../shared/types';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Snapshot tối thiểu kiểm tra bản nháp và thay đổi hồ sơ từ tác vụ nền. */
function state(): SessionSnapshot {
  return {
    settings: DEFAULT_SETTINGS,
    resolvedTheme: 'dark',
    hasApiKey: true,
    profiles: [DEFAULT_PROFILE],
    sessions: [],
    session: null,
    status: 'idle',
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

describe('Hồ sơ có bổ sung AI', () => {
  it('đặt nút xóa trước nút thử lại trong mục hồ sơ AI', () => {
    render(<Context snapshot={state()} />);
    const section = screen.getByRole('region', { name: 'context.aiTitle' });
    const buttons = within(section).getAllByRole('button');
    expect(buttons[0].textContent).toBe('context.clearProfile');
    expect(buttons[1].textContent).toBe('app.retry');
    expect(buttons[0].classList.contains('btn-error')).toBe(true);
  });
  it('xác nhận trước khi xóa nội dung hồ sơ và gửi đúng revision', async () => {
    const clear = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('app', { clearProfile: clear });
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const snapshot = { ...state(), profiles: [{ ...DEFAULT_PROFILE, revision: 3 }] };
    render(<Context snapshot={snapshot} />);
    const button = screen.getByRole('button', { name: 'context.clearProfile' });
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(button);
    await vi.waitFor(() => expect(clear).toHaveBeenCalledWith('general', 3));
    confirm.mockRestore();
  });
  it('không cho xóa khi đang sửa bản nháp', () => {
    render(<Context snapshot={state()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'context.instructions' }), {
      target: { value: 'Đang nhập' },
    });
    expect(
      screen.getByRole('button', { name: 'context.clearProfile' }).hasAttribute('disabled'),
    ).toBe(true);
  });
  it('ghi nhớ hồ sơ đã chọn khi đóng và mở lại tab', () => {
    const snapshot = {
      ...state(),
      profiles: [DEFAULT_PROFILE, { ...DEFAULT_PROFILE, id: 'game', name: 'Game' }],
    };
    const view = render(<Context snapshot={snapshot} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'context.select' }), {
      target: { value: 'game' },
    });
    view.unmount();
    render(<Context snapshot={snapshot} />);
    expect(
      (screen.getByRole('combobox', { name: 'context.select' }) as HTMLSelectElement).value,
    ).toBe('game');
  });
  it('khóa thử lại và báo đang chờ khi yêu cầu chưa hoàn tất', async () => {
    let finish: (result: { ok: true; value: undefined }) => void = () => undefined;
    const retry = vi.fn(
      () =>
        new Promise<{ ok: true; value: undefined }>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('app', { retryProfile: retry });
    const game = { ...DEFAULT_PROFILE, id: 'game', name: 'Game', aiEnabled: true };
    const snapshot = {
      ...state(),
      profiles: [DEFAULT_PROFILE, game],
      settings: { ...DEFAULT_SETTINGS, model: 'm' },
      profileTasks: [{ profileId: 'game', status: 'error' as const, error: 'NETWORK' as const }],
    };
    const view = render(<Context snapshot={snapshot} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'context.select' }), {
      target: { value: 'game' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'app.retry' }));
    expect(screen.getByRole('button', { name: 'app.retry' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('context.aiStatus.queued')).toBeTruthy();
    finish({ ok: true, value: undefined });
    await vi.waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    view.unmount();
  });
  it('giữ bản đang sửa và bắt tải lại khi revision trên main thay đổi', () => {
    const snapshot = state();
    const view = render(<Context snapshot={snapshot} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'context.instructions' }), {
      target: { value: 'Đang nhập' },
    });
    view.rerender(
      <Context
        snapshot={{
          ...snapshot,
          profiles: [{ ...DEFAULT_PROFILE, revision: 1, instructions: 'AI mới' }],
        }}
      />,
    );
    expect(
      (screen.getByRole('textbox', { name: 'context.instructions' }) as HTMLInputElement).value,
    ).toBe('Đang nhập');
    expect(screen.getByRole('button', { name: 'app.save' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'context.reload' }));
    expect(
      (screen.getByRole('textbox', { name: 'context.instructions' }) as HTMLInputElement).value,
    ).toBe('AI mới');
  });
  it('cập nhật hồ sơ đang xem khi không có bản nháp và cho bỏ đề xuất', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('app', { resolveProfileProposal: resolve });
    const snapshot = state();
    const view = render(<Context snapshot={snapshot} />);
    view.rerender(
      <Context
        snapshot={{
          ...snapshot,
          profiles: [{ ...DEFAULT_PROFILE, revision: 1, instructions: 'AI mới' }],
          profileProposals: [
            {
              id: 'proposal',
              profileId: 'general',
              field: 'instructions',
              key: '',
              before: '"AI mới"',
              after: '"Đề nghị"',
              evidence: 'Câu số 2',
              status: 'pending',
            },
          ],
        }}
      />,
    );
    expect(
      (screen.getByRole('textbox', { name: 'context.instructions' }) as HTMLInputElement).value,
    ).toBe('AI mới');
    fireEvent.click(screen.getByRole('button', { name: 'context.reject' }));
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledWith('proposal', 'reject'));
  });
});
