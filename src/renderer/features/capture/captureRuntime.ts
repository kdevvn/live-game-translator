import { CAPTURE_INTERVAL_MS, STABLE_TEXT_MS } from '../../../shared/defaults';
import type {
  ApiResult,
  CaptureCommand,
  CaptureRegion,
  PreviewSignal,
} from '../../../shared/types';
import { createOcrEngine, readableText } from './ocr';
import type { OcrEngine } from './ocr';
import { createPreviewPeer } from './preview';
import type { PreviewPeer } from './preview';

const STALE_FRAME_MS = 15000;

/** Bridge riêng cho capture; không có quyền đọc key hoặc thay hồ sơ. */
interface CaptureBridge {
  command(): Promise<ApiResult<CaptureCommand>>;
  subscribe(callback: (command: CaptureCommand) => void): () => void;
  ready(generation: number): Promise<unknown>;
  result(value: {
    generation: number;
    text: string;
    ms: number;
    manual: boolean;
  }): Promise<unknown>;
  error(code: 'CAPTURE' | 'OCR', generation: number): Promise<unknown>;
  preview(signal: PreviewSignal): void;
  onPreview(callback: (signal: PreviewSignal) => void): () => void;
}
declare global {
  interface Window {
    captureBridge: CaptureBridge;
  }
}

/** Chạy một stream và worker OCR tái sử dụng; lệnh stop hủy mọi callback cũ. */
export function initializeCapture(): () => void {
  const bridge = window.captureBridge;
  let token = 0;
  let stream: MediaStream | null = null;
  let worker: OcrEngine | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let active: Extract<CaptureCommand, { action: 'start' | 'preview' }> | null = null;
  let pendingPreview: PreviewSignal | null = null;
  let busy = false;
  let manualPending = false;
  let framePending = false;
  let processingFingerprint = '';
  let lastFingerprint = '';
  let lastText = '';
  let lastMs = 0;
  let lastReported = 0;
  let previewPeer: PreviewPeer | null = null;
  let previewId = '';
  let lastTime = 0;
  let lastAdvance = Date.now();
  const video = document.createElement('video');
  video.muted = true;
  video.autoplay = true;
  document.body.append(video);
  const canvas = document.createElement('canvas');
  const processing = document.createElement('canvas');
  video.onresize = () => {
    const peer = previewPeer;
    void peer?.resize(video.videoWidth, video.videoHeight).catch(() => {
      if (active && previewId && peer === previewPeer)
        bridge.preview({
          generation: previewGeneration() ?? active.generation,
          id: previewId,
          message: { type: 'unavailable' },
        });
    });
  };

  /** Giữ generation signaling của stream khi phiên OCR thay đổi. */
  function previewGeneration(): number | undefined {
    if (active?.action === 'start') return active.previewGeneration ?? active.generation;
    return active?.generation;
  }

  /** Hủy riêng OCR và callback cũ, giữ nguồn video cho preview khi tạm dừng. */
  function stopOcr(): void {
    token++;
    clearInterval(timer);
    timer = undefined;
    const old = worker;
    worker = null;
    old?.dispose();
    busy = false;
    manualPending = false;
    framePending = false;
    processingFingerprint = '';
    lastFingerprint = '';
    lastText = '';
    lastReported = 0;
    lastTime = 0;
    lastAdvance = Date.now();
  }
  /** Giải phóng ngay nguồn, peer và OCR khi dừng hẳn hoặc đổi cửa sổ. */
  function stop(): void {
    stopOcr();
    active = null;
    pendingPreview = null;
    previewPeer?.dispose();
    previewPeer = null;
    previewId = '';
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  }
  /** Tạo dấu ảnh lấy mẫu thưa để tránh OCR lại khi vùng chữ không đổi. */
  function fingerprint(context: CanvasRenderingContext2D, width: number, height: number): string {
    const pixels = context.getImageData(0, 0, width, height).data;
    let hash = 2166136261;
    for (let i = 0; i < pixels.length; i += 64) hash = Math.imul(hash ^ pixels[i], 16777619);
    return `${width}:${height}:${hash}`;
  }
  /** Chụp crop tại kích thước frame thực; chuẩn hóa lựa chọn không phụ thuộc DPI. */
  function draw(region: CaptureRegion): CanvasRenderingContext2D {
    const width = video.videoWidth;
    const height = video.videoHeight;
    const cropWidth = Math.max(1, Math.round(width * region.width));
    const cropHeight = Math.max(1, Math.round(height * region.height));
    if (canvas.width !== cropWidth) canvas.width = cropWidth;
    if (canvas.height !== cropHeight) canvas.height = cropHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('CAPTURE');
    context.drawImage(
      video,
      width * region.x,
      height * region.y,
      width * region.width,
      height * region.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return context;
  }
  /**
   * Theo dõi vùng chữ ở nhịp capture; OCR chỉ giữ một frame mới nhất đang chờ.
   * Ảnh đang OCR được chụp riêng để lượt dự phòng không đọc nhầm frame tiếp theo.
   */
  async function sample(manual = false): Promise<void> {
    const current = active;
    const currentToken = token;
    let ownsWorker = false;
    if (current?.action !== 'start' || !worker || !video.videoWidth) return;
    try {
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        lastAdvance = Date.now();
      } else if (Date.now() - lastAdvance > STALE_FRAME_MS) {
        await bridge.error('CAPTURE', current.generation);
        stop();
        return;
      }
      const context = draw(current.region);
      const signature = fingerprint(context, canvas.width, canvas.height);
      if (busy) {
        manualPending ||= manual;
        framePending = signature !== processingFingerprint;
        return;
      }
      if (!manual && signature === lastFingerprint) {
        if (Date.now() - lastReported < STABLE_TEXT_MS) return;
        lastReported = Date.now();
        await bridge.result({
          generation: current.generation,
          text: lastText,
          ms: lastMs,
          manual: false,
        });
        return;
      }
      busy = true;
      ownsWorker = true;
      framePending = false;
      processingFingerprint = signature;
      processing.width = canvas.width;
      processing.height = canvas.height;
      const processingContext = processing.getContext('2d');
      if (!processingContext) throw new Error('OCR');
      processingContext.drawImage(canvas, 0, 0);
      const start = performance.now();
      const result = await worker.recognize(processing);
      if (currentToken !== token) return;
      lastFingerprint = signature;
      lastText = readableText(result);
      lastMs = Math.round(performance.now() - start);
      lastReported = Date.now();
      await bridge.result({ generation: current.generation, text: lastText, ms: lastMs, manual });
    } catch {
      if (currentToken === token) {
        await bridge.error('OCR', current.generation);
        stop();
      }
    } finally {
      if (currentToken === token && ownsWorker) {
        busy = false;
        if (framePending || manualPending) {
          const manual = manualPending;
          manualPending = false;
          framePending = false;
          void sample(manual);
        }
      }
    }
  }
  /** Mở video trước OCR; bật theo dõi cùng nguồn tái sử dụng stream preview đã sẵn sàng. */
  async function start(
    command: Extract<CaptureCommand, { action: 'start' | 'preview' }>,
  ): Promise<void> {
    const reuse = active?.sourceId === command.sourceId && stream !== null;
    if (!reuse) stop();
    else if (active?.action === 'start') stopOcr();
    active = command;
    const currentToken = token;
    let nextWorker: OcrEngine | null = null;
    try {
      const videoConstraints = {
        resizeMode: { ideal: 'none' },
      };
      const nextStream = reuse
        ? stream
        : await navigator.mediaDevices.getDisplayMedia({
            video: videoConstraints,
            audio: false,
          });
      if (!nextStream) throw new Error('CAPTURE');
      if (currentToken !== token) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = nextStream;
      if (!reuse) {
        video.srcObject = stream;
        await video.play();
      }
      if (currentToken !== token) return;
      if (!reuse)
        stream.getVideoTracks()[0].addEventListener(
          'ended',
          () => {
            if (stream === nextStream) {
              if (active) void bridge.error('CAPTURE', active.generation);
              stop();
            }
          },
          { once: true },
        );
      if (pendingPreview) {
        const pending = pendingPreview;
        pendingPreview = null;
        void previewSignal(pending);
      }
      if (command.action === 'preview') return;
      nextWorker = createOcrEngine();
      if (currentToken !== token) {
        nextWorker.dispose();
        return;
      }
      worker = nextWorker;
      lastAdvance = Date.now();
      await bridge.ready(command.generation);
      if (currentToken !== token || active !== command) return;
      timer = setInterval(() => {
        void sample();
      }, CAPTURE_INTERVAL_MS);
      void sample();
    } catch {
      if (currentToken === token) {
        const id = pendingPreview?.id ?? previewId;
        if (id)
          bridge.preview({
            generation: previewGeneration() ?? command.generation,
            id,
            message: { type: 'unavailable' },
          });
        await bridge.error(nextWorker ? 'OCR' : 'CAPTURE', command.generation);
        stop();
      } else nextWorker?.dispose();
    }
  }
  /** Điều khiển preview và OCR bằng cùng một stream, stop vô hiệu mọi callback cũ. */
  function receive(command: CaptureCommand): void {
    if (command.action === 'stop') stop();
    else if (command.action === 'recognize') void sample(true);
    else void start(command);
  }
  /** Preview mượn stream hiện tại; lỗi preview không làm dừng OCR. */
  async function previewSignal(signal: PreviewSignal): Promise<void> {
    if (signal.generation !== previewGeneration()) return;
    if (!stream || !video.videoWidth) {
      if (signal.message.type === 'request') pendingPreview = signal;
      else if (signal.message.type === 'close' && pendingPreview?.id === signal.id)
        pendingPreview = null;
      return;
    }
    try {
      if (signal.message.type === 'request') {
        previewPeer?.dispose();
        previewId = signal.id;
        const peer = createPreviewPeer();
        previewPeer = peer;
        const sdp = await peer.offer(stream, video.videoWidth, video.videoHeight);
        if (previewGeneration() === signal.generation && previewPeer === peer)
          bridge.preview({ ...signal, message: { type: 'offer', sdp } });
      } else if (signal.id === previewId) {
        if (signal.message.type === 'answer') await previewPeer?.accept(signal.message.sdp);
        else if (signal.message.type === 'close') {
          previewPeer?.dispose();
          previewPeer = null;
          previewId = '';
        }
      }
    } catch {
      if (previewGeneration() === signal.generation && signal.id === previewId) {
        previewPeer?.dispose();
        previewPeer = null;
        bridge.preview({ ...signal, message: { type: 'unavailable' } });
      }
    }
  }
  const unsubscribePreview = bridge.onPreview((signal) => {
    void previewSignal(signal);
  });
  let disposed = false;
  let receivedCommand = false;
  const unsubscribe = bridge.subscribe((command) => {
    receivedCommand = true;
    if (!disposed) receive(command);
  });
  void bridge.command().then((result) => {
    if (!disposed && !receivedCommand && result.ok) receive(result.value);
  });
  return () => {
    disposed = true;
    unsubscribe();
    unsubscribePreview();
    stop();
    video.onresize = null;
    video.remove();
  };
}
