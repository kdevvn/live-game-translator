import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from '../../../shared/defaults';

const PREVIEW_BITRATE = 16000000;
const ICE_TIMEOUT_MS = 5000;

/** Chỉ thu nhỏ nguồn vượt Full HD; UI tự co ảnh để không nén mất chữ theo khung nhỏ. */
function previewScale(width: number, height: number): number {
  return Math.max(1, width / PREVIEW_WIDTH, height / PREVIEW_HEIGHT);
}

/** Peer nội bộ, không dùng STUN/TURN hoặc gửi ảnh qua IPC. */
export interface PreviewPeer {
  offer(stream: MediaStream, width: number, height: number): Promise<string>;
  answer(sdp: string): Promise<string>;
  accept(sdp: string): Promise<void>;
  resize(width: number, height: number): Promise<void>;
  dispose(): void;
}

/** Tạo kết nối preview nội bộ dùng lại track capture; không mở nguồn thứ hai. */
export function createPreviewPeer(onStream?: (stream: MediaStream) => void): PreviewPeer {
  const peer = new RTCPeerConnection({ iceServers: [] });
  let disposed = false;
  let cancelGathering: (() => void) | undefined;
  let sender: RTCRtpSender | undefined;
  let track: MediaStreamTrack | undefined;
  let originalHint = '';
  let sourceWidth = PREVIEW_WIDTH;
  let sourceHeight = PREVIEW_HEIGHT;
  let parametersQueue = Promise.resolve();
  peer.ontrack = (event) => onStream?.(event.streams[0] ?? new MediaStream([event.track]));

  /** Gom ICE vào SDP để IPC không cần hàng đợi candidate hoặc xử lý đảo thứ tự. */
  async function local(description: RTCSessionDescriptionInit): Promise<string> {
    if (disposed) throw new Error('CAPTURE');
    await peer.setLocalDescription(description);
    if (disposed) throw new Error('CAPTURE');
    if (peer.iceGatheringState !== 'complete') {
      await new Promise<void>((resolve, reject) => {
        /** Gỡ timer/listener khi hoàn tất, lỗi hoặc đóng peer. */
        function finish(error?: Error): void {
          clearTimeout(timer);
          peer.removeEventListener('icegatheringstatechange', changed);
          cancelGathering = undefined;
          if (error) reject(error);
          else resolve();
        }
        /** Chỉ phát SDP khi mọi candidate nội bộ đã sẵn sàng. */
        function changed(): void {
          if (peer.iceGatheringState === 'complete') finish();
        }
        const timer = setTimeout(() => finish(new Error('CAPTURE')), ICE_TIMEOUT_MS);
        cancelGathering = () => finish(new Error('CAPTURE'));
        peer.addEventListener('icegatheringstatechange', changed);
        changed();
      });
    }
    const sdp = peer.localDescription?.sdp;
    if (disposed || !sdp) throw new Error('CAPTURE');
    return sdp;
  }
  /** Xếp tuần tự thay đổi kích thước để không ghi đè transaction của sender. */
  function configure(): Promise<void> {
    const update = parametersQueue.then(async () => {
      if (disposed || !sender) return;
      const parameters = sender.getParameters();
      parameters.degradationPreference = 'maintain-resolution';
      for (const encoding of parameters.encodings) {
        encoding.scaleResolutionDownBy = previewScale(sourceWidth, sourceHeight);
      }
      await sender.setParameters(parameters);
    });
    parametersQueue = update.catch(() => undefined);
    return update;
  }
  /** Cập nhật tỷ lệ theo nguồn, giữ trần Full HD. */
  function resize(width: number, height: number): Promise<void> {
    sourceWidth = width;
    sourceHeight = height;
    return configure();
  }
  return {
    /** Truyền đủ chi tiết nguồn tới trần Full HD, không phụ thuộc kích thước khung UI. */
    async offer(stream, width, height) {
      track = stream.getVideoTracks()[0];
      originalHint = track.contentHint || '';
      track.contentHint = 'detail';
      const transceiver = peer.addTransceiver(track, {
        direction: 'sendonly',
        streams: [stream],
        sendEncodings: [
          {
            maxBitrate: PREVIEW_BITRATE,
            scaleResolutionDownBy: previewScale(width, height),
          },
        ],
      });
      sender = transceiver.sender;
      const sdp = await local(await peer.createOffer());
      await resize(width, height);
      return sdp;
    },
    /** Nhận offer từ capture và trả SDP của UI. */
    async answer(sdp) {
      await peer.setRemoteDescription({ type: 'offer', sdp });
      return local(await peer.createAnswer());
    },
    /** Capture áp dụng answer sau khi main đã kiểm tra generation. */
    async accept(sdp) {
      await peer.setRemoteDescription({ type: 'answer', sdp });
    },
    resize,
    /** Không dừng track gốc vì peer chỉ mượn stream của pipeline OCR. */
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelGathering?.();
      peer.ontrack = null;
      peer.close();
      if (track) track.contentHint = originalHint;
    },
  };
}

/** Gắn preview video vào UI; unmount/đổi generation giải phóng peer và listener. */
export function connectPreview(
  video: HTMLVideoElement,
  generation: number,
  failed: () => void,
): () => void {
  const id = crypto.randomUUID();
  let disposed = false;
  const peer = createPreviewPeer((stream) => {
    if (!disposed) {
      video.srcObject = stream;
      void video.play().catch(fail);
    }
  });
  const unsubscribe = window.app.onPreview((signal) => {
    if (signal.id !== id || signal.generation !== generation || disposed) return;
    if (signal.message.type === 'unavailable') fail();
    if (signal.message.type === 'offer') {
      void peer
        .answer(signal.message.sdp)
        .then((sdp) => {
          if (!disposed) window.app.preview({ generation, id, message: { type: 'answer', sdp } });
        })
        .catch(fail);
    }
  });
  window.app.preview({ generation, id, message: { type: 'request' } });
  /** Lỗi chỉ kết thúc preview; pipeline capture/OCR tiếp tục độc lập. */
  function fail(): void {
    if (disposed) return;
    dispose();
    failed();
  }
  /** Đóng cả listener và peer đúng một lần, kể cả khi Promise trả muộn. */
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    peer.dispose();
    video.srcObject = null;
    window.app.preview({ generation, id, message: { type: 'close' } });
  }
  return dispose;
}
