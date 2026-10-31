// Bridge chỉ dùng trong server preview kiểm tra hình ảnh; không nằm trong bộ cài.
const params = new URL(window.location.href).searchParams;
const streaming = params.get('stream') === '1';
const state = {
  settings: {
    provider: params.get('provider') === 'lmStudio' ? 'lmStudio' : 'openRouter',
    lmStudioBaseUrl: 'http://localhost:1234/v1',
    lmStudioModel: '',
    lmStudioSummaryModel: '',
    lmStudioProfileModel: '',
    theme: params.get('theme') ?? 'light',
    locale: params.get('locale') ?? 'vi',
    previewFps: 30,
    model: streaming ? 'preview/stream-model' : '',
    summaryModel: '',
    profileModel: '',
    profileLearningInterval: 20,
    profileInputTokenLimit: 15000,
    autoTranslate: false,
    duplicateThreshold: 80,
    translateShortcut: 'Ctrl+Alt+T',
    pauseShortcut: 'Ctrl+Alt+P',
    overlayFontSize: 28,
    overlayFullscreen: false,
    overlayFullscreenFontSize: 28,
    overlayOpacity: 0.85,
    overlayDurationSeconds: 5,
  },
  resolvedTheme: params.get('theme') ?? 'light',
  hasApiKey: streaming || params.get('models') === '1',
  profiles: [
    {
      id: 'general',
      name: 'Chung',
      instructions: '',
      characters: [],
      relationships: [],
      glossary: [],
      revision: 0,
    },
  ],
  sessions: [],
  session: null,
  status: streaming ? 'running' : 'idle',
  dialogues: streaming
    ? [
        {
          id: 'preview-stream',
          sessionId: 'preview',
          sequence: 1,
          text: 'Father, we must leave before dawn.',
          translation: 'Cha ơi, chúng ta phải rời đi',
          speaker: 'unknown',
          listener: 'unknown',
          status: params.get('usage') === '1' ? 'translated' : 'pending',
          createdAt: 0,
          ocrMs: 37,
          apiMs: 0,
          ...(params.get('usage') === '1'
            ? {
                usage: { inputTokens: 420, outputTokens: 36 },
                costUsd: 0.00001234,
                modelId: 'preview/actual-subtitle-model:free',
              }
            : {}),
        },
      ]
    : [],
  ocrText: streaming ? 'Father, we must leave before dawn.' : '',
  error: null,
  overlayEditing: false,
  overlayText: streaming ? 'Cha ơi, chúng ta phải rời đi' : '',
  generation: 0,
  sourceId: '',
  sourceName: '',
  region: { x: 0, y: 0.65, width: 1, height: 0.35 },
};
const listeners = new Set();
const previewListeners = new Set();
let previewOwner = null;
let previewStream = null;
let previewPeer = null;
let previewPeerId = null;
let previewFrame = 0;
const ok = (value) => Promise.resolve({ ok: true, value });

/** Giải phóng nguồn canvas và peer giả lập, không truy cập cửa sổ desktop thật. */
function stopPreviewFixture() {
  window.cancelAnimationFrame(previewFrame);
  previewPeer?.close();
  previewPeer = null;
  previewPeerId = null;
  previewStream?.getTracks().forEach((track) => track.stop());
  previewStream = null;
}

/** Tạo nguồn video thay đổi liên tục để kiểm tra renderer và WebRTC trên browser. */
async function selectPreviewFixture(sourceId, id) {
  if (sourceId === null) {
    if (previewOwner === id) {
      previewOwner = null;
      stopPreviewFixture();
      state.previewGeneration = undefined;
      for (const listener of listeners) listener({ ...state });
    }
    return ok(state.generation);
  }
  if (previewStream && state.sourceId === sourceId) {
    previewOwner = id;
    return ok(state.previewGeneration);
  }
  stopPreviewFixture();
  state.sourceId = sourceId;
  previewOwner = id;
  const sources = await window.app.sources();
  const source = sources.value.find((source) => source.id === sourceId);
  const image = source?.thumbnail ? new window.Image() : null;
  if (image) {
    image.src = source.thumbnail;
    await image.decode();
  }
  if (previewOwner !== id) return { ok: false, error: 'CAPTURE' };
  const canvas = document.createElement('canvas');
  const sizes = {
    wide: { width: 1920, height: 1080 },
    standard: { width: 1440, height: 1080 },
    portrait: { width: 608, height: 1080 },
  };
  const size = sizes[params.get('shape')] ?? sizes.wide;
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  let frames = 0;
  /** Vẽ frame có bộ đếm và dấu màu đổi liên tục để phát hiện preview bị đứng. */
  function draw() {
    context.fillStyle = '#202020';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (image) context.drawImage(image, 0, 0, canvas.width, canvas.height);
    else {
      context.fillStyle = '#ffffff';
      context.font = '48px sans-serif';
      context.fillText(`Live preview fixture · frame ${frames}`, 180, 100);
      context.fillText('Father, the gate is open.', 220, 850);
    }
    context.fillStyle = Math.floor(frames++ / 20) % 2 ? '#00ff00' : '#ff0000';
    context.fillRect(0, 0, 140, 140);
    previewFrame = window.requestAnimationFrame(draw);
  }
  draw();
  previewStream = canvas.captureStream(60);
  state.previewGeneration = ++state.generation;
  for (const listener of listeners) listener({ ...state });
  return ok(state.previewGeneration);
}

/** Mô phỏng đầu gửi capture, trao SDP thật để UI dùng đúng connectPreview sản phẩm. */
async function signalPreviewFixture(signal) {
  if (signal.generation !== state.previewGeneration || !previewStream) return;
  if (signal.message.type === 'request') {
    previewPeer?.close();
    const peer = new window.RTCPeerConnection({ iceServers: [] });
    previewPeer = peer;
    previewPeerId = signal.id;
    const track = previewStream.getVideoTracks()[0];
    track.contentHint = 'detail';
    const { sender } = peer.addTransceiver(track, {
      direction: 'sendonly',
      streams: [previewStream],
      sendEncodings: [
        { maxFramerate: state.settings.previewFps, maxBitrate: 16000000, scaleResolutionDownBy: 1 },
      ],
    });
    await peer.setLocalDescription(await peer.createOffer());
    const parameters = sender.getParameters();
    parameters.degradationPreference = 'maintain-resolution';
    await sender.setParameters(parameters);
    if (peer.iceGatheringState !== 'complete')
      await new Promise((resolve) => {
        peer.addEventListener('icegatheringstatechange', () => {
          if (peer.iceGatheringState === 'complete') resolve();
        });
      });
    if (peer !== previewPeer) return;
    for (const listener of previewListeners)
      listener({ ...signal, message: { type: 'offer', sdp: peer.localDescription.sdp } });
  } else if (signal.id === previewPeerId) {
    if (signal.message.type === 'answer')
      await previewPeer.setRemoteDescription({ type: 'answer', sdp: signal.message.sdp });
    else if (signal.message.type === 'close') {
      previewPeer.close();
      previewPeer = null;
      previewPeerId = null;
    }
  }
}

window.app = {
  snapshot: () => ok(state),
  subscribe: (callback) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
  sources: () =>
    ok(
      params.get('preview') === '1'
        ? [
            { id: 'fixture:1', name: 'Live preview fixture A' },
            { id: 'fixture:2', name: 'Live preview fixture B' },
          ]
        : [],
    ),
  previewSource: selectPreviewFixture,
  onPreview: (callback) => {
    previewListeners.add(callback);
    return () => previewListeners.delete(callback);
  },
  preview: (signal) => {
    void signalPreviewFixture(signal).catch(() => {
      for (const listener of previewListeners)
        listener({ ...signal, message: { type: 'unavailable' } });
    });
  },
  models: () =>
    ok(
      params.get('models') === '1'
        ? [
            { id: 'preview/alpha', name: 'Alpha', contextLength: 8000, isFree: false },
            { id: 'preview/zeta-free', name: 'Zeta', contextLength: 8000, isFree: true },
            { id: 'preview/beta-free', name: 'Beta', contextLength: 8000, isFree: true },
          ]
        : [],
    ),
  settings: async (value) => {
    state.settings = value;
    const sender = previewPeer?.getSenders()[0];
    if (sender) {
      const parameters = sender.getParameters();
      for (const encoding of parameters.encodings) encoding.maxFramerate = value.previewFps;
      await sender.setParameters(parameters);
    }
    state.resolvedTheme = value.theme === 'system' ? 'light' : value.theme;
    for (const listener of listeners) listener({ ...state });
    return ok();
  },
  saveKey: () => Promise.resolve({ ok: false, error: 'FORBIDDEN' }),
  saveProfile: () => Promise.resolve({ ok: false, error: 'FORBIDDEN' }),
  clearProfile: () => Promise.resolve({ ok: false, error: 'FORBIDDEN' }),
  deleteProfile: () => Promise.resolve({ ok: false, error: 'FORBIDDEN' }),
  retryProfile: () => ok(),
  resolveProfileProposal: () => ok(),
  session: () => ok(),
  reset: () => ok(),
  start: () => {
    previewOwner = null;
    state.generation++;
    state.session ??= {
      id: 'preview-session',
      profileId: 'general',
      name: 'Preview',
      createdAt: 0,
    };
    state.status = 'starting';
    for (const listener of listeners) listener({ ...state });
    state.status = 'running';
    for (const listener of listeners) listener({ ...state });
    return ok();
  },
  control: (action) => {
    if (action === 'pause') {
      if (state.status === 'paused') return window.app.start();
      state.status = 'paused';
      state.generation++;
      for (const listener of listeners) listener({ ...state });
      return ok();
    }
    state.status = 'idle';
    state.previewGeneration = undefined;
    stopPreviewFixture();
    for (const listener of listeners) listener({ ...state });
    return ok();
  },
  editDialogue: () => ok(),
  retry: () => ok(),
  overlay: () => ok(),
  testSource: () => ok(),
};

// Chỉ server preview chèn bridge này; query mở màn hình phục vụ Taste inspector.
if (params.get('screen') === 'settings') {
  const observer = new window.MutationObserver(() => {
    const nav = document.querySelector('nav button:last-child');
    if (!nav) return;
    observer.disconnect();
    nav.click();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
