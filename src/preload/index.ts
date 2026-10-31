import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '../shared/channels';
import type {
  AppBridge,
  DebugEntry,
  ApiResult,
  CaptureCommand,
  SessionSnapshot,
  PreviewSignal,
} from '../shared/types';

/** Chỉ đăng ký channel đã định nghĩa, luôn trả cleanup đúng listener. */
function listen<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T): void => callback(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}
/** Gọi IPC nội bộ có kiểu, không công bố channel tùy ý ra renderer. */
function invoke<T>(channel: string, value?: unknown): Promise<ApiResult<T>> {
  return ipcRenderer.invoke(channel, value) as Promise<ApiResult<T>>;
}

const role = new URL(window.location.href).searchParams.get('role');
if (role === 'capture') {
  contextBridge.exposeInMainWorld('captureBridge', {
    command: () => invoke<CaptureCommand>(CHANNELS.captureCommand),
    subscribe: (callback: (command: CaptureCommand) => void) =>
      listen(CHANNELS.captureCommand, callback),
    ready: (generation: number) => invoke(CHANNELS.captureReady, generation),
    result: (value: unknown) => invoke(CHANNELS.captureResult, value),
    error: (code: 'CAPTURE' | 'OCR', generation: number) =>
      invoke(CHANNELS.captureError, { code, generation }),
    preview: (signal: PreviewSignal) => ipcRenderer.send(CHANNELS.preview, signal),
    onPreview: (callback: (signal: PreviewSignal) => void) => listen(CHANNELS.preview, callback),
  });
} else if (role !== 'test') {
  const bridge: AppBridge = {
    debugLogs: () => invoke(CHANNELS.debugLogs),
    onDebugLogs: (callback: (entries: DebugEntry[]) => void) =>
      listen(CHANNELS.debugChanged, callback),
    clearDebugLogs: () => invoke(CHANNELS.debugClear),
    snapshot: () => invoke(CHANNELS.snapshot),
    subscribe: (callback: (state: SessionSnapshot) => void) => listen(CHANNELS.state, callback),
    sources: () => invoke(CHANNELS.sources),
    previewSource: (sourceId, id) => invoke(CHANNELS.previewSource, { sourceId, id }),
    setProfileRegion: (profileId, region) => invoke(CHANNELS.profileRegion, { profileId, region }),
    settings: (value) => invoke(CHANNELS.settings, value),
    saveKey: (key, provider = 'openRouter') => invoke(CHANNELS.key, { key, provider }),
    models: () => invoke(CHANNELS.models),
    saveProfile: (profile) => invoke(CHANNELS.profileSave, profile),
    clearProfile: (id, revision) => invoke(CHANNELS.profileClear, { id, revision }),
    deleteProfile: (id) => invoke(CHANNELS.profileDelete, id),
    retryProfile: (id) => invoke(CHANNELS.profileRetry, id),
    resolveProfileProposal: (id, action) => invoke(CHANNELS.profileResolve, { id, action }),
    session: (profileId, resumeId) => invoke(CHANNELS.session, { profileId, resumeId }),
    reset: () => invoke(CHANNELS.reset),
    start: (sourceId, region) => invoke(CHANNELS.start, { sourceId, region }),
    control: (action) => invoke(CHANNELS.control, action),
    editDialogue: (dialogue) => invoke(CHANNELS.edit, dialogue),
    retry: (id) => invoke(CHANNELS.retry, id),
    overlay: (editing) => invoke(CHANNELS.overlay, editing),
    overlayPointer: (active) => invoke(CHANNELS.overlayPointer, active),
    closeFullscreenOverlay: () => invoke(CHANNELS.closeFullscreenOverlay),
    testSource: () => invoke(CHANNELS.testSource),
    preview: (signal) => ipcRenderer.send(CHANNELS.preview, signal),
    onPreview: (callback) => listen(CHANNELS.preview, callback),
  };
  contextBridge.exposeInMainWorld('app', bridge);
}
