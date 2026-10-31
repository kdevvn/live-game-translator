// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult, CaptureCommand, PreviewSignal } from '../../../shared/types';
import { createOcrEngine } from './ocr';
import { initializeCapture } from './captureRuntime';

const worker = vi.hoisted(() => ({
  recognize: vi.fn(),
  dispose: vi.fn(),
}));
const peer = vi.hoisted(() => ({
  offer: vi.fn(),
  accept: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('./preview', () => ({ createPreviewPeer: () => peer }));
vi.mock('./ocr', async (original) => ({
  ...(await original<typeof import('./ocr')>()),
  createOcrEngine: vi.fn(() => worker),
}));

let cleanup: (() => void) | undefined;
let receive: (command: CaptureCommand) => void;
let preview: (signal: PreviewSignal) => void;
let pixel = 240;
const stopTrack = vi.fn();
const getDisplayMedia = vi.fn();
const result = vi.fn();
const command: CaptureCommand = {
  action: 'start',
  sourceId: 'window:1',
  generation: 1,
  region: { x: 0.1, y: 0.7, width: 0.8, height: 0.1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  peer.offer.mockResolvedValue('local-sdp');
  worker.recognize.mockReset();
  pixel = 240;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getDisplayMedia },
  });
  getDisplayMedia.mockResolvedValue({
    getTracks: () => [{ stop: stopTrack }],
    getVideoTracks: () => [{ addEventListener: vi.fn() }],
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1920);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(1080);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        putImageData: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray([pixel, pixel, pixel, 255]) }),
      }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AA');
  window.captureBridge = {
    command: async () => ({ ok: true, value: command }),
    subscribe: (callback) => {
      receive = callback;
      return vi.fn();
    },
    ready: vi.fn().mockResolvedValue(undefined),
    result,
    error: vi.fn().mockResolvedValue(undefined),
    preview: vi.fn(),
    onPreview: (callback) => {
      preview = callback;
      return vi.fn();
    },
  };
});

afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Luồng OCR capture', () => {
  it('tạm dừng giữa lúc trao SDP vẫn gửi offer cho kết nối video đang mở', async () => {
    vi.useFakeTimers();
    worker.recognize.mockImplementation(() => new Promise(() => undefined));
    let finish: (sdp: string) => void = () => undefined;
    peer.offer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    cleanup = initializeCapture();
    await vi.advanceTimersByTimeAsync(0);
    const signal: PreviewSignal = {
      generation: 1,
      id: crypto.randomUUID(),
      message: { type: 'request' },
    };
    preview(signal);
    receive({ action: 'preview', sourceId: command.sourceId, generation: 1 });
    finish('pending-offer');
    await vi.advanceTimersByTimeAsync(0);
    expect(window.captureBridge.preview).toHaveBeenCalledWith({
      ...signal,
      message: { type: 'offer', sdp: 'pending-offer' },
    });
  });

  it('tạm dừng rồi tiếp tục giữ video/peer, bỏ OCR trả muộn và nhận kết quả phiên mới', async () => {
    vi.useFakeTimers();
    let finish: (value: { text: string }) => void = () => undefined;
    worker.recognize.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    worker.recognize.mockResolvedValue({ text: 'New frame.', confidence: 92 });
    cleanup = initializeCapture();
    await vi.advanceTimersByTimeAsync(0);
    const signal: PreviewSignal = {
      generation: 1,
      id: crypto.randomUUID(),
      message: { type: 'request' },
    };
    preview(signal);
    await vi.advanceTimersByTimeAsync(0);
    receive({ action: 'preview', sourceId: command.sourceId, generation: 1 });
    await vi.advanceTimersByTimeAsync(100);
    expect(worker.dispose).toHaveBeenCalledTimes(1);
    expect(worker.recognize).toHaveBeenCalledTimes(1);
    finish({ text: 'Old frame.' });
    await vi.advanceTimersByTimeAsync(0);
    expect(result).not.toHaveBeenCalled();
    receive({ ...command, generation: 3, previewGeneration: 1 });
    await vi.advanceTimersByTimeAsync(0);
    preview({ ...signal, message: { type: 'answer', sdp: 'same-peer' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(peer.accept).toHaveBeenCalledWith('same-peer');
    expect(result).toHaveBeenCalledWith(
      expect.objectContaining({ generation: 3, text: 'New frame.' }),
    );
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(peer.offer).toHaveBeenCalledTimes(1);
    expect(peer.dispose).not.toHaveBeenCalled();
    expect(stopTrack).not.toHaveBeenCalled();
  });

  it('khởi tạo OCR chậm vẫn giữ peer, SDP generation và phát video đang có', async () => {
    vi.useFakeTimers();
    worker.recognize.mockImplementation(() => new Promise(() => undefined));
    window.captureBridge.command = async () => ({ ok: true, value: { action: 'stop' } });
    cleanup = initializeCapture();
    await vi.advanceTimersByTimeAsync(0);
    receive({ action: 'preview', sourceId: 'window:1', generation: 1 });
    await vi.advanceTimersByTimeAsync(0);
    const signal: PreviewSignal = {
      generation: 1,
      id: crypto.randomUUID(),
      message: { type: 'request' },
    };
    preview(signal);
    await vi.advanceTimersByTimeAsync(0);
    receive({ ...command, generation: 2, previewGeneration: 1 });
    await vi.advanceTimersByTimeAsync(100);
    preview({ ...signal, message: { type: 'answer', sdp: 'stable-answer' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(peer.accept).toHaveBeenCalledWith('stable-answer');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(peer.offer).toHaveBeenCalledTimes(1);
    expect(peer.dispose).not.toHaveBeenCalled();
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(worker.recognize).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveBeenCalled();
  });
  it('xem trực tiếp khi chọn nguồn, giữ request sớm và chưa khởi tạo OCR', async () => {
    vi.useFakeTimers();
    window.captureBridge.command = async () => ({ ok: true, value: { action: 'stop' } });
    cleanup = initializeCapture();
    await vi.advanceTimersByTimeAsync(0);
    receive({ action: 'preview', sourceId: 'window:1', generation: 1 });
    const signal: PreviewSignal = {
      generation: 1,
      id: crypto.randomUUID(),
      message: { type: 'request' },
    };
    preview(signal);
    await vi.advanceTimersByTimeAsync(100);
    expect(peer.offer).toHaveBeenCalledWith(expect.anything(), 1920, 1080);
    expect(window.captureBridge.preview).toHaveBeenCalledWith({
      ...signal,
      message: { type: 'offer', sdp: 'local-sdp' },
    });
    expect(worker.recognize).not.toHaveBeenCalled();
    expect(createOcrEngine).not.toHaveBeenCalled();
    expect(window.captureBridge.ready).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
  });

  it('bật OCR trên luồng preview hiện tại, không mở lại nguồn hoặc dừng track', async () => {
    vi.useFakeTimers();
    worker.recognize.mockResolvedValue({ text: 'Stay close.', confidence: 92 });
    window.captureBridge.command = async () => ({ ok: true, value: { action: 'stop' } });
    cleanup = initializeCapture();
    await vi.advanceTimersByTimeAsync(0);
    receive({ action: 'preview', sourceId: 'window:1', generation: 1 });
    await vi.advanceTimersByTimeAsync(0);
    receive({ ...command, generation: 2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(stopTrack).not.toHaveBeenCalled();
    expect(window.captureBridge.ready).toHaveBeenCalledWith(2);
    expect(result).toHaveBeenCalledWith(expect.objectContaining({ generation: 2 }));
  });

  it('đổi nguồn và hủy preview giải phóng track, bỏ stream trả về muộn', async () => {
    vi.useFakeTimers();
    window.captureBridge.command = async () => ({ ok: true, value: { action: 'stop' } });
    cleanup = initializeCapture();
    await vi.advanceTimersByTimeAsync(0);
    receive({ action: 'preview', sourceId: 'window:1', generation: 1 });
    await vi.advanceTimersByTimeAsync(0);
    let finish: (stream: unknown) => void = () => undefined;
    getDisplayMedia.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    receive({ action: 'preview', sourceId: 'window:2', generation: 2 });
    expect(stopTrack).toHaveBeenCalledTimes(1);
    receive({ action: 'stop' });
    const stopLate = vi.fn();
    finish({ getTracks: () => [{ stop: stopLate }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopLate).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveBeenCalled();
  });

  it('lệnh khởi tạo trả muộn không ghi đè nguồn mới hoặc mở lại capture sau cleanup', async () => {
    vi.useFakeTimers();
    let finish: (value: ApiResult<CaptureCommand>) => void = () => undefined;
    window.captureBridge.command = () => new Promise((resolve) => (finish = resolve));
    cleanup = initializeCapture();
    receive({ action: 'preview', sourceId: 'window:2', generation: 2 });
    await vi.advanceTimersByTimeAsync(0);
    finish({ ok: true, value: command });
    await vi.advanceTimersByTimeAsync(0);
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(worker.recognize).not.toHaveBeenCalled();
    cleanup();
    cleanup = initializeCapture();
    cleanup();
    finish({ ok: true, value: command });
    await vi.advanceTimersByTimeAsync(0);
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
  });

  it('không giới hạn FPS stream, theo dõi OCR riêng và không gửi JPEG qua IPC', async () => {
    vi.useFakeTimers();
    worker.recognize.mockImplementation(() => new Promise(() => undefined));
    cleanup = initializeCapture();
    await vi.advanceTimersByTimeAsync(0);
    expect(getDisplayMedia.mock.calls[0][0].video).not.toHaveProperty('frameRate');
    const canvasCalls = vi.mocked(HTMLCanvasElement.prototype.getContext);
    const initial = canvasCalls.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100);
    expect(canvasCalls.mock.calls.length - initial).toBeGreaterThanOrEqual(3);
    expect(worker.recognize).toHaveBeenCalledTimes(1);
    expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
  });

  it('OCR xong xử lý ngay frame mới nhất, không xếp hàng từng frame', async () => {
    vi.useFakeTimers();
    let finish: (value: { text: string; confidence: number }) => void = () => undefined;
    worker.recognize.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    cleanup = initializeCapture();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 5; i++) {
      pixel--;
      await vi.advanceTimersByTimeAsync(34);
    }
    expect(worker.recognize).toHaveBeenCalledTimes(1);
    finish({ text: 'First.', confidence: 92 });
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.recognize).toHaveBeenCalledTimes(2);
    finish({ text: 'Latest.', confidence: 92 });
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Latest.' }));
    expect(worker.recognize).toHaveBeenCalledTimes(2);
  });

  it('frame tĩnh không OCR lại hoặc phát IPC theo từng frame', async () => {
    vi.useFakeTimers();
    worker.recognize.mockResolvedValue({ text: 'Stay close.', confidence: 92 });
    cleanup = initializeCapture();
    await vi.advanceTimersByTimeAsync(1000);
    expect(worker.recognize).toHaveBeenCalledTimes(1);
    expect(result.mock.calls.length).toBeLessThanOrEqual(8);
    expect(result.mock.calls.length).toBeGreaterThan(1);
  });

  it('dừng cũng bỏ frame đang chờ, không khởi động OCR sau khi kết quả cũ trả về', async () => {
    vi.useFakeTimers();
    let finish: (value: { text: string; confidence: number }) => void = () => undefined;
    worker.recognize.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    cleanup = initializeCapture();
    await vi.advanceTimersByTimeAsync(0);
    pixel--;
    await vi.advanceTimersByTimeAsync(100);
    receive({ action: 'stop' });
    finish({ text: 'Old.', confidence: 92 });
    await vi.advanceTimersByTimeAsync(100);
    expect(worker.recognize).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveBeenCalled();
  });
  it('trả kết quả PaddleOCR và giữ kích thước stream tự nhiên', async () => {
    worker.recognize.mockResolvedValue({ text: 'Stay close.\n', confidence: 92 });
    cleanup = initializeCapture();
    await vi.waitFor(() =>
      expect(result).toHaveBeenCalledWith({
        generation: 1,
        text: 'Stay close.',
        ms: expect.any(Number),
        manual: false,
      }),
    );
    const constraints = getDisplayMedia.mock.calls[0][0].video;
    expect(constraints).not.toHaveProperty('width');
    expect(constraints).not.toHaveProperty('height');
    expect(constraints.resizeMode).toEqual({ ideal: 'none' });
  });

  it('đọc không rõ thì trả rỗng để không dịch chuỗi rác', async () => {
    worker.recognize.mockResolvedValue({ text: 'ee PS A \\ =', confidence: 23 });
    cleanup = initializeCapture();
    await vi.waitFor(() =>
      expect(result).toHaveBeenCalledWith(expect.objectContaining({ text: '' })),
    );
  });

  it('dừng trong lúc OCR không gửi kết quả muộn và giải phóng engine', async () => {
    let finish: (value: { text: string; confidence: number }) => void = () => undefined;
    worker.recognize.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    cleanup = initializeCapture();
    await vi.waitFor(() => expect(worker.recognize).toHaveBeenCalledTimes(1));
    receive({ action: 'stop' });
    finish({ text: 'late', confidence: 23 });
    await Promise.resolve();
    expect(result).not.toHaveBeenCalled();
    expect(worker.recognize).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalled();
    expect(worker.dispose).toHaveBeenCalled();
  });
});
