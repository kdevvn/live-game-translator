// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS, DEFAULT_PROFILE, DEFAULT_REGION } from '../../../shared/defaults';
import type { Dialogue } from '../../../shared/types';
import { Translation } from './Translation';

vi.mock('../capture/Capture', () => ({ Capture: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { input: number; output: number; amount: string; model: string }) =>
      key === 'translation.tokens'
        ? `Input ${values?.input} / Output ${values?.output}`
        : key === 'translation.cost'
          ? `Cost ${values?.amount}`
          : key === 'translation.model'
            ? `Model ${values?.model}`
            : key,
  }),
}));
afterEach(cleanup);

describe('Token của từng lần dịch', () => {
  it('hiển thị phiên được chọn sau khi trạng thái phiên cập nhật', async () => {
    const current = {
      id: 'current',
      profileId: DEFAULT_PROFILE.id,
      summary: '',
      summarizedThrough: 0,
      createdAt: 0,
    };
    const previous = { ...current, id: 'previous', createdAt: 1000 };
    const snapshot = {
      settings: DEFAULT_SETTINGS,
      resolvedTheme: 'light' as const,
      hasApiKey: false,
      profiles: [DEFAULT_PROFILE],
      sessions: [current, previous],
      session: current,
      status: 'idle' as const,
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
    const openSession = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('app', { session: openSession });
    const { rerender } = render(<Translation snapshot={snapshot} />);
    const select = screen.getByRole('combobox', {
      name: 'translation.resumeSession',
    }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: previous.id } });
    await vi.waitFor(() =>
      expect(openSession).toHaveBeenCalledWith(DEFAULT_PROFILE.id, previous.id),
    );
    rerender(<Translation snapshot={{ ...snapshot, session: previous }} />);
    expect(select.value).toBe(previous.id);
    vi.unstubAllGlobals();
  });
  it('gom đủ tùy chỉnh phụ đề, xem trước và hướng dẫn vị trí trong tab dịch', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const overlay = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('app', { settings: save, overlay });
    render(
      <Translation
        snapshot={{
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
          overlayEditing: false,
          overlayText: '',
          generation: 0,
          sourceId: '',
          sourceName: '',
          region: DEFAULT_REGION,
        }}
      />,
    );
    expect(screen.getByText('translation.overlaySettingsHint')).toBeTruthy();
    expect(screen.getByText('settings.preview')).toBeTruthy();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.fontSize' }), {
      target: { value: '36' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.overlayDuration' }), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'translation.overlay' }));
    await vi.waitFor(() => expect(overlay).toHaveBeenCalledWith(true));
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          overlayFontSize: 36,
          overlayDurationSeconds: 8,
        }),
      ),
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.fontSize' }), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.overlayDuration' }), {
      target: { value: '61' },
    });
    fireEvent.change(screen.getByRole('slider', { name: /settings.opacity/ }), {
      target: { value: '75' },
    });
    cleanup();
    await vi.waitFor(() =>
      expect(save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          overlayFontSize: 36,
          overlayDurationSeconds: 8,
          overlayOpacity: 0.75,
        }),
      ),
    );
    vi.unstubAllGlobals();
  });
  it('tắt toàn màn hình áp dụng ngay khi bỏ chọn', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('app', { settings: save });
    render(
      <Translation
        snapshot={{
          settings: { ...DEFAULT_SETTINGS, overlayFullscreen: true },
          resolvedTheme: 'light',
          hasApiKey: false,
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
        }}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'settings.overlayFullscreen' }));
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ overlayFullscreen: false })),
    );
    vi.unstubAllGlobals();
  });
  it('chỉnh chế độ, cỡ chữ và độ mờ overlay ngay trong tab', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('app', { settings: save });
    render(
      <Translation
        snapshot={{
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
          overlayEditing: false,
          overlayText: '',
          generation: 0,
          sourceId: '',
          sourceName: '',
          region: DEFAULT_REGION,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'settings.overlayFullscreen' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.fullscreenFontSize' }), {
      target: { value: '44' },
    });
    fireEvent.change(screen.getByRole('slider', { name: /settings.opacity/ }), {
      target: { value: '70' },
    });
    expect(screen.queryByRole('button', { name: 'app.save' })).toBeNull();
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          overlayFullscreen: true,
          overlayFullscreenFontSize: 44,
          overlayOpacity: 0.7,
        }),
      ),
    );
    vi.unstubAllGlobals();
  });
  it('bỏ qua cỡ chữ không hợp lệ và lưu độ mờ khi rời trang', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('app', { settings: save });
    render(
      <Translation
        snapshot={{
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
          overlayEditing: false,
          overlayText: '',
          generation: 0,
          sourceId: '',
          sourceName: '',
          region: DEFAULT_REGION,
        }}
      />,
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.fullscreenFontSize' }), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByRole('slider', { name: /settings.opacity/ }), {
      target: { value: '65' },
    });
    cleanup();
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ overlayFullscreenFontSize: 28, overlayOpacity: 0.65 }),
      ),
    );
    vi.unstubAllGlobals();
  });
  it('lưu tuần tự khi thay đổi overlay trong lúc đang lưu', async () => {
    let finish: (() => void) | undefined;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve({ ok: true });
          }),
      )
      .mockResolvedValue({ ok: true });
    vi.stubGlobal('app', { settings: save });
    render(
      <Translation
        snapshot={{
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
          overlayEditing: false,
          overlayText: '',
          generation: 0,
          sourceId: '',
          sourceName: '',
          region: DEFAULT_REGION,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'settings.overlayFullscreen' }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.fullscreenFontSize' }), {
      target: { value: '42' },
    });
    fireEvent.change(screen.getByRole('slider', { name: /settings.opacity/ }), {
      target: { value: '75' },
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(save).toHaveBeenCalledTimes(1);
    finish?.();
    await vi.waitFor(() =>
      expect(save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          overlayFullscreen: true,
          overlayFullscreenFontSize: 42,
          overlayOpacity: 0.75,
        }),
      ),
    );
    vi.unstubAllGlobals();
  });
  it.each(['reported', 'missing', 'cache', 'tiny'] as const)(
    'hiển thị usage %s và không nhầm dữ liệu thiếu thành 0',
    (mode) => {
      const dialogue: Dialogue = {
        id: 'one',
        sessionId: 'session',
        sequence: 1,
        text: 'Hello.',
        translation: 'Chào.',
        speaker: 'unknown',
        listener: 'unknown',
        status: 'translated',
        createdAt: 0,
        ocrMs: 12,
        apiMs: 120,
        ...(mode === 'reported' || mode === 'cache' ? { modelId: 'vendor/actual-model:free' } : {}),
        ...(mode === 'reported'
          ? { usage: { inputTokens: 321, outputTokens: 22 }, costUsd: 0.00001234 }
          : {}),
        ...(mode === 'cache'
          ? { usage: { inputTokens: 0, outputTokens: 0 }, fromCache: true, costUsd: 0 }
          : {}),
      };
      if (mode === 'tiny')
        Object.assign(dialogue, { usage: { inputTokens: 321, outputTokens: 22 }, costUsd: 1e-12 });
      render(
        <Translation
          snapshot={{
            settings: DEFAULT_SETTINGS,
            resolvedTheme: 'light',
            hasApiKey: false,
            profiles: [DEFAULT_PROFILE],
            sessions: [],
            session: null,
            status: 'idle',
            dialogues: [dialogue],
            ocrText: '',
            error: null,
            overlayEditing: false,
            overlayText: '',
            generation: 0,
            sourceId: '',
            sourceName: '',
            region: DEFAULT_REGION,
          }}
        />,
      );
      expect(
        screen.getByText(
          mode === 'missing'
            ? 'translation.tokensUnknown'
            : mode === 'cache'
              ? 'Input 0 / Output 0'
              : 'Input 321 / Output 22',
        ),
      ).toBeTruthy();
      expect(Boolean(screen.queryByText('translation.cached'))).toBe(mode === 'cache');
      expect(
        screen.getByText(
          mode === 'reported' || mode === 'cache'
            ? 'Model vendor/actual-model:free'
            : 'translation.modelUnknown',
        ),
      ).toBeTruthy();
      expect(
        screen.getByText(
          mode === 'missing'
            ? 'translation.costUnknown'
            : mode === 'tiny'
              ? 'translation.costLessThan'
              : new RegExp(mode === 'cache' ? '^Cost .*0[.,]00' : '^Cost .*0[.,]00001234'),
        ),
      ).toBeTruthy();
    },
  );
});
