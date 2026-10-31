// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { connectPreview, createPreviewPeer } from './preview';
import type { PreviewSignal } from '../../../shared/types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('preview không đặt giới hạn FPS và giữ giới hạn Full HD', async () => {
  const setParameters = vi.fn();
  const addTransceiver = vi.fn(() => ({
    sender: {
      getParameters: () => ({ encodings: [{}] }),
      setParameters,
    },
  }));
  const close = vi.fn();
  const setLocalDescription = vi.fn();
  vi.stubGlobal(
    'RTCPeerConnection',
    vi.fn(function () {
      return {
        addTransceiver,
        close,
        setLocalDescription,
        createOffer: async () => ({ type: 'offer', sdp: 'local-offer' }),
        iceGatheringState: 'complete',
        localDescription: { type: 'offer', sdp: 'local-offer' },
      };
    }),
  );
  const track = { stop: vi.fn() };
  const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
  const peer = createPreviewPeer();
  expect(await peer.offer(stream, 3840, 2160)).toBe('local-offer');
  expect(addTransceiver).toHaveBeenCalledWith(
    track,
    expect.objectContaining({
      direction: 'sendonly',
      sendEncodings: [expect.objectContaining({ scaleResolutionDownBy: 2 })],
    }),
  );
  expect(addTransceiver.mock.calls[0][1].sendEncodings[0]).not.toHaveProperty('maxFramerate');
  expect(setParameters.mock.calls[0][0].encodings[0]).not.toHaveProperty('maxFramerate');
  expect(addTransceiver).toHaveBeenCalledTimes(1);
  expect(setParameters).toHaveBeenCalledWith(
    expect.objectContaining({
      degradationPreference: 'maintain-resolution',
    }),
  );
  await peer.resize(1920, 1080);
  expect(setParameters).toHaveBeenLastCalledWith(
    expect.objectContaining({
      encodings: [expect.objectContaining({ scaleResolutionDownBy: 1 })],
    }),
  );
  peer.dispose();
  peer.dispose();
  expect(close).toHaveBeenCalledTimes(1);
  expect(track.stop).not.toHaveBeenCalled();
});

it('giữ chi tiết tối đa Full HD dù khung nhỏ, giữ tỷ lệ và không phóng lớn nguồn', async () => {
  const setParameters = vi.fn();
  vi.stubGlobal(
    'RTCPeerConnection',
    vi.fn(function () {
      return {
        addTransceiver: () => ({
          sender: { getParameters: () => ({ encodings: [{}] }), setParameters },
        }),
        setLocalDescription: vi.fn(),
        createOffer: async () => ({ type: 'offer', sdp: 'offer' }),
        iceGatheringState: 'complete',
        localDescription: { sdp: 'offer' },
        close: vi.fn(),
      };
    }),
  );
  const track = { contentHint: '', stop: vi.fn() };
  const peer = createPreviewPeer();
  await peer.offer({ getVideoTracks: () => [track] } as unknown as MediaStream, 1920, 1200);
  expect(track.contentHint).toBe('detail');
  expect(setParameters).toHaveBeenLastCalledWith(
    expect.objectContaining({
      encodings: [expect.objectContaining({ scaleResolutionDownBy: 1200 / 1080 })],
    }),
  );
  await peer.resize(1600, 1000);
  expect(setParameters).toHaveBeenLastCalledWith(
    expect.objectContaining({
      encodings: [expect.objectContaining({ scaleResolutionDownBy: 1 })],
    }),
  );
  await peer.resize(640, 400);
  expect(setParameters).toHaveBeenLastCalledWith(
    expect.objectContaining({
      encodings: [expect.objectContaining({ scaleResolutionDownBy: 1 })],
    }),
  );
  peer.dispose();
  expect(track.contentHint).toBe('');
});

it('resize và DPI của UI không làm hạ độ phân giải video nhận', () => {
  vi.stubGlobal(
    'RTCPeerConnection',
    vi.fn(function () {
      return { close: vi.fn() };
    }),
  );
  vi.stubGlobal('devicePixelRatio', 2);
  const preview = vi.fn();
  vi.stubGlobal('app', { preview, onPreview: () => vi.fn() });
  const video = document.createElement('video');
  video.getBoundingClientRect = () => ({ width: 640 }) as DOMRect;
  const dispose = connectPreview(video, 1, vi.fn());
  expect(preview.mock.calls[0][0].message).toEqual({ type: 'request' });
  window.dispatchEvent(new Event('resize'));
  expect(preview).toHaveBeenCalledTimes(1);
  dispose();
  expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ message: { type: 'close' } }));
});

it('UI bỏ signaling cũ và lỗi preview giải phóng peer/listener mà không dừng capture', () => {
  const close = vi.fn();
  vi.stubGlobal(
    'RTCPeerConnection',
    vi.fn(function () {
      return { close };
    }),
  );
  let receive: (signal: PreviewSignal) => void = () => undefined;
  const unsubscribe = vi.fn();
  const preview = vi.fn();
  vi.stubGlobal('app', {
    preview,
    onPreview: (callback: typeof receive) => {
      receive = callback;
      return unsubscribe;
    },
  });
  const video = document.createElement('video');
  const failed = vi.fn();
  const dispose = connectPreview(video, 4, failed);
  const request = preview.mock.calls[0][0] as PreviewSignal;
  receive({ ...request, generation: 3, message: { type: 'unavailable' } });
  expect(failed).not.toHaveBeenCalled();
  receive({ ...request, message: { type: 'unavailable' } });
  expect(failed).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(video.srcObject).toBeNull();
  dispose();
  expect(close).toHaveBeenCalledTimes(1);
  expect(preview).toHaveBeenLastCalledWith({ ...request, message: { type: 'close' } });
});
