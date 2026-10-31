// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PROFILE, DEFAULT_REGION, DEFAULT_SETTINGS } from '../../../shared/defaults';
import type { ApiResult, SessionSnapshot } from '../../../shared/types';
import { Capture } from './Capture';

const connect = vi.hoisted(() => vi.fn());
vi.mock('./preview', () => ({ connectPreview: connect }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const state: SessionSnapshot = {
  settings: DEFAULT_SETTINGS,
  resolvedTheme: 'dark',
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
};
const release = vi.fn();
const previewSource = vi.fn();
let publish: (snapshot: SessionSnapshot) => void = () => undefined;

beforeEach(() => {
  vi.clearAllMocks();
  connect.mockReturnValue(release);
  previewSource.mockImplementation(async (sourceId: string | null) => {
    await Promise.resolve();
    if (sourceId) publish({ ...state, previewGeneration: 1 });
    return { ok: true, value: 1 };
  });
  window.app = {
    sources: async () => ({
      ok: true,
      value: [
        { id: 'window:1', name: 'Game A' },
        { id: 'window:2', name: 'Game B' },
      ],
    }),
    previewSource,
    start: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as typeof window.app;
});
afterEach(cleanup);

/** Mô phỏng snapshot main phát sau khi nhận lệnh mở preview. */
function openCapture() {
  const view = render(<Capture snapshot={state} />);
  publish = (snapshot) => view.rerender(<Capture snapshot={snapshot} />);
  return view;
}

/** Chọn nguồn từ danh sách đã làm mới, tương tự thao tác bàn phím của người dùng. */
async function selectSource(id = 'window:1'): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'capture.refresh' }));
  await screen.findByRole('option', { name: 'Game A' });
  fireEvent.change(screen.getByLabelText('capture.selectWindow'), { target: { value: id } });
}

it('không hiển thị cấu hình FPS video xem trước', () => {
  openCapture();
  expect(screen.queryByLabelText('capture.previewFps')).toBeNull();
});

it('chọn cửa sổ mở video trực tiếp trước khi theo dõi và hủy khi rời màn hình', async () => {
  const view = openCapture();
  await selectSource();
  await waitFor(() =>
    expect(connect).toHaveBeenCalledWith(expect.any(HTMLVideoElement), 1, expect.any(Function)),
  );
  expect(screen.queryByRole('img')).toBeNull();
  expect(window.app.start).not.toHaveBeenCalled();
  const owner = previewSource.mock.calls[0][1];
  view.unmount();
  expect(release).toHaveBeenCalled();
  expect(previewSource).toHaveBeenCalledWith(null, owner);
});

it('chọn nguồn đứng trước video, các nút và tọa độ nằm sau video theo thứ tự đọc', async () => {
  const { container } = openCapture();
  await selectSource();
  const video = container.querySelector('video');
  const coordinates = container.querySelector('summary');
  if (!video || !coordinates) throw new Error('Thiếu preview hoặc tọa độ vùng chữ');
  const select = screen.getByLabelText('capture.selectWindow');
  expect(select.compareDocumentPosition(video) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  for (const name of ['capture.start', 'capture.pause', 'capture.stop']) {
    const button = screen.getByRole('button', { name });
    expect(video.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
  expect(
    video.compareDocumentPosition(coordinates) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('đổi nguồn nhanh không cho kết quả cũ gắn lại video', async () => {
  let finish: (value: ApiResult<number>) => void = () => undefined;
  previewSource.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  openCapture();
  await selectSource();
  fireEvent.change(screen.getByLabelText('capture.selectWindow'), {
    target: { value: 'window:2' },
  });
  await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
  finish({ ok: true, value: 9 });
  await waitFor(() =>
    expect(connect).not.toHaveBeenCalledWith(expect.anything(), 9, expect.anything()),
  );
  expect(connect).toHaveBeenCalledTimes(1);
});

it('bật theo dõi giữ nguyên peer và video trong lúc khởi tạo OCR, kể cả tạo phiên mới', async () => {
  const session = {
    id: 'new-session',
    profileId: 'general',
    summary: '',
    summarizedThrough: 0,
    createdAt: 0,
  };
  const view = render(<Capture snapshot={{ ...state, session }} />);
  publish = (snapshot) => view.rerender(<Capture snapshot={{ ...snapshot, session }} />);
  await selectSource();
  await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'capture.start' }));
  expect(window.app.start).toHaveBeenCalledWith('window:1', DEFAULT_REGION);
  for (const status of ['starting', 'running'] as const)
    view.rerender(
      <Capture snapshot={{ ...state, session, status, generation: 8, previewGeneration: 1 }} />,
    );
  expect(connect).toHaveBeenCalledTimes(1);
  expect(release).not.toHaveBeenCalled();
});

it('lưu vùng chọn trước khi bắt đầu và đổi vùng theo hồ sơ', async () => {
  const saveRegion = vi.fn().mockResolvedValue({ ok: true });
  window.app.setProfileRegion = saveRegion;
  const session = { id: 's1', profileId: 'one', summary: '', summarizedThrough: 0, createdAt: 0 };
  const view = render(<Capture snapshot={{ ...state, session }} />);
  fireEvent.click(screen.getByText('capture.coordinates'));
  fireEvent.change(screen.getByLabelText('capture.y'), { target: { value: '50' } });
  await waitFor(() =>
    expect(saveRegion).toHaveBeenCalledWith('one', { ...DEFAULT_REGION, y: 0.5 }),
  );
  view.rerender(
    <Capture
      snapshot={{
        ...state,
        session: { ...session, id: 's2', profileId: 'two' },
        region: { x: 0, y: 0, width: 1, height: 1 },
      }}
    />,
  );
  expect((screen.getByLabelText('capture.y') as HTMLInputElement).value).toBe('0');
});
