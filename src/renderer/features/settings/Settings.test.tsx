// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_PROFILE, DEFAULT_REGION, DEFAULT_SETTINGS } from '../../../shared/defaults';
import { Settings } from './Settings';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, data?: { input: string; output: string }) =>
      key === 'settings.modelPrice' ? `${data?.input} / ${data?.output}` : key,
  }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('FPS preview được chuyển khỏi màn hình Cài đặt', async () => {
  await openSettings();
  expect(screen.queryByRole('spinbutton', { name: 'settings.previewFps' })).toBeNull();
});

/** Mở form thật với danh sách model giả lập, không gọi API trả phí. */
async function openSettings(model = '') {
  const save = vi.fn().mockResolvedValue({ ok: true });
  const saveKey = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('app', {
    saveKey,
    models: async () => ({
      ok: true,
      value: [
        {
          id: 'paid/cheap',
          name: 'Cheap',
          contextLength: 8000,
          isFree: false,
          supportsStructuredOutputs: true,
          inputPricePerMillion: 0.2,
          outputPricePerMillion: 0.3,
        },
        {
          id: 'paid/alpha',
          name: 'Alpha',
          contextLength: 8000,
          isFree: false,
          supportsStructuredOutputs: true,
          inputPricePerMillion: 2,
          outputPricePerMillion: 3,
        },
        {
          id: 'free/zeta',
          name: 'Zeta',
          contextLength: 8000,
          isFree: true,
          supportsStructuredOutputs: true,
          inputPricePerMillion: 0,
          outputPricePerMillion: 0,
        },
        {
          id: 'free/beta',
          name: 'Beta',
          contextLength: 8000,
          isFree: true,
          supportsStructuredOutputs: true,
          inputPricePerMillion: 0,
          outputPricePerMillion: 0,
        },
      ],
    }),
    settings: save,
  });
  render(
    <Settings
      snapshot={{
        settings: { ...DEFAULT_SETTINGS, model },
        resolvedTheme: 'light',
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
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'settings.loadModels' }));
  const combo = screen.getByRole('combobox', { name: 'settings.model' });
  fireEvent.focus(combo);
  return { combo, save, saveKey };
}

describe('Chọn model dịch', () => {
  it('tự lưu khi đổi thiết lập và không hiện nút lưu', async () => {
    const { save } = await openSettings();
    expect(screen.queryByRole('button', { name: 'app.save' })).toBeNull();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.profileLearningInterval' }), {
      target: { value: '8' },
    });
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ profileLearningInterval: 8 })),
    );
  });
  it('tự lưu API key khi rời ô nhập', async () => {
    const { saveKey } = await openSettings();
    const input = screen.getByLabelText('settings.key');
    fireEvent.change(input, { target: { value: 'new-secret' } });
    fireEvent.blur(input);
    await vi.waitFor(() => expect(saveKey).toHaveBeenCalledWith('new-secret'));
  });
  it('không lưu giá trị sai và vẫn lưu trường hợp lệ khác', async () => {
    const { save } = await openSettings();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.profileLearningInterval' }), {
      target: { value: '201' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.duplicateThreshold' }), {
      target: { value: '90' },
    });
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ profileLearningInterval: 20, duplicateThreshold: 90 }),
      ),
    );
  });
  it('lưu tuần tự để thay đổi sau không ghi đè thay đổi trước', async () => {
    const { save } = await openSettings();
    let finish: (() => void) | undefined;
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ ok: true });
        }),
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.profileLearningInterval' }), {
      target: { value: '8' },
    });
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.duplicateThreshold' }), {
      target: { value: '90' },
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(save).toHaveBeenCalledTimes(1);
    finish?.();
    await vi.waitFor(() =>
      expect(save).toHaveBeenLastCalledWith(
        expect.objectContaining({ profileLearningInterval: 8, duplicateThreshold: 90 }),
      ),
    );
  });
  it('lưu thay đổi đang chờ khi rời trang', async () => {
    const { save } = await openSettings();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.profileLearningInterval' }), {
      target: { value: '9' },
    });
    cleanup();
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ profileLearningInterval: 9 })),
    );
  });
  it('hiện mặc định 15000 và lưu ngân sách hồ sơ riêng', async () => {
    const { save } = await openSettings();
    await screen.findByRole('listbox');
    const input = screen.getByRole('spinbutton', { name: 'settings.profileInputTokenLimit' });
    expect((input as HTMLInputElement).value).toBe('15000');
    fireEvent.change(input, { target: { value: '25000' } });
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ profileInputTokenLimit: 25000 })),
    );
  });
  it('lưu model nền riêng và nhịp học mà không thay model dịch', async () => {
    const { save } = await openSettings('paid/alpha');
    await screen.findByRole('listbox');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'settings.model' }), { key: 'Escape' });
    const summary = screen.getByRole('combobox', { name: 'settings.summaryModel' });
    fireEvent.focus(summary);
    fireEvent.change(summary, { target: { value: 'free/beta' } });
    fireEvent.keyDown(summary, { key: 'Enter' });
    const profile = screen.getByRole('combobox', { name: 'settings.profileModel' });
    fireEvent.focus(profile);
    fireEvent.change(profile, { target: { value: 'free/zeta' } });
    fireEvent.keyDown(profile, { key: 'Enter' });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'settings.profileLearningInterval' }), {
      target: { value: '12' },
    });
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'paid/alpha',
          summaryModel: 'free/beta',
          profileModel: 'free/zeta',
          profileLearningInterval: 12,
        }),
      ),
    );
  });
  it('cho đổi ngưỡng lọc trùng và lưu 0 để tắt lọc', async () => {
    const { save } = await openSettings();
    const threshold = screen.getByRole('spinbutton', { name: 'settings.duplicateThreshold' });
    expect(threshold.getAttribute('value')).toBe('80');
    fireEvent.change(threshold, { target: { value: '95' } });
    await vi.waitFor(() =>
      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ duplicateThreshold: 95 })),
    );
    fireEvent.change(threshold, { target: { value: '0' } });
    await vi.waitFor(() =>
      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ duplicateThreshold: 0 })),
    );
  });
  it('đưa model miễn phí lên trước rồi sắp theo tên, không tự chọn model', async () => {
    const { save } = await openSettings();
    const list = await screen.findByRole('listbox');
    const options = within(list).getAllByRole('option');
    expect(options.slice(0, 4).map((option) => option.textContent)).toEqual([
      expect.stringContaining('Beta'),
      expect.stringContaining('Zeta'),
      expect.stringContaining('Cheap'),
      expect.stringContaining('Alpha'),
    ]);
    expect(options[3].textContent).toContain('$2 / $3');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'settings.model' }), { key: 'Escape' });
    expect(save).not.toHaveBeenCalled();
  });

  it('tìm theo tên hoặc ID không phân biệt hoa thường và chọn bằng bàn phím', async () => {
    const { combo, save } = await openSettings();
    await screen.findByRole('listbox');
    fireEvent.change(combo, { target: { value: 'FREE/ZETA' } });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(combo, { key: 'Enter' });
    expect(screen.queryByRole('listbox')).toBeNull();
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ model: 'free/zeta' })),
    );
  });

  it('tìm không thấy rồi Escape vẫn giữ model đã chọn, không lưu chuỗi tìm kiếm', async () => {
    const { combo, save } = await openSettings('paid/alpha');
    await screen.findByRole('listbox');
    fireEvent.change(combo, { target: { value: 'không tồn tại' } });
    expect(screen.getByText('settings.noModels')).toBeTruthy();
    fireEvent.keyDown(combo, { key: 'Escape' });
    expect(save).not.toHaveBeenCalled();
  });
});

it('chọn LM Studio hiện địa chỉ và token, lưu cấu hình trước khi tải model', async () => {
  const { save, saveKey } = await openSettings();
  fireEvent.change(screen.getByRole('combobox', { name: 'settings.provider' }), {
    target: { value: 'lmStudio' },
  });
  const endpoint = screen.getByRole('textbox', { name: 'settings.lmStudioBaseUrl' });
  fireEvent.change(endpoint, { target: { value: 'http://192.168.1.10:1234/v1' } });
  fireEvent.change(screen.getByLabelText('settings.lmStudioToken'), {
    target: { value: 'local-secret' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'settings.loadModels' }));
  await vi.waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: 'lmStudio',
        lmStudioBaseUrl: 'http://192.168.1.10:1234/v1',
      }),
    ),
  );
  await vi.waitFor(() => expect(saveKey).toHaveBeenCalledWith('local-secret', 'lmStudio'));
});

it('địa chỉ đang nhập sai không làm crash và không cho tải model', async () => {
  await openSettings();
  fireEvent.change(screen.getByRole('combobox', { name: 'settings.provider' }), {
    target: { value: 'lmStudio' },
  });
  const endpoint = screen.getByRole('textbox', { name: 'settings.lmStudioBaseUrl' });
  fireEvent.change(endpoint, { target: { value: 'not-a-url' } });
  expect(endpoint.getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByRole('button', { name: 'settings.loadModels' }).hasAttribute('disabled')).toBe(
    true,
  );
});

it('Ollama và LM Studio có địa chỉ, hướng dẫn và cấu hình riêng', async () => {
  const { save } = await openSettings();
  const provider = screen.getByRole('combobox', { name: 'settings.provider' });
  fireEvent.change(provider, { target: { value: 'ollama' } });
  const endpoint = screen.getByRole('textbox', { name: 'settings.ollamaBaseUrl' });
  expect(endpoint.getAttribute('placeholder')).toBe('http://localhost:11434/v1');
  expect(screen.getByText('settings.ollamaHint')).toBeTruthy();
  fireEvent.change(endpoint, { target: { value: 'http://localhost:11435/v1' } });
  fireEvent.click(screen.getByRole('button', { name: 'settings.loadModels' }));
  await vi.waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: 'ollama',
        ollamaBaseUrl: 'http://localhost:11435/v1',
      }),
    ),
  );
  fireEvent.change(provider, { target: { value: 'lmStudio' } });
  expect(
    screen.getByRole('textbox', { name: 'settings.lmStudioBaseUrl' }).getAttribute('placeholder'),
  ).toBe('http://localhost:1234/v1');
  expect(screen.getByText('settings.lmStudioHint')).toBeTruthy();
});

it('không còn cấu hình phụ đề nổi trong Cài đặt', async () => {
  await openSettings();
  expect(screen.queryByText('settings.overlay')).toBeNull();
  expect(screen.queryByRole('checkbox', { name: 'settings.overlayFullscreen' })).toBeNull();
});
