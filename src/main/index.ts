import { effectiveModel, providerIdentity } from '../shared/modelSettings';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  nativeTheme,
  safeStorage,
  screen,
  session as electronSession,
  ipcMain,
  protocol,
  net,
} from 'electron';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { openDatabase } from './database';
import { OpenRouter, OPENROUTER_ENDPOINT } from './features/openRouter';
import { DebugLog } from './features/debugLog';
import { listCaptureSources } from './features/captureSources';
import { createOpenRouterTransport } from './features/openRouterTransport';
import { SessionController, errorCode } from './features/session';
import { createWindow, updateOverlayVisibility } from './windows';
import { capturePermission, handle } from './ipc';
import { CHANNELS } from '../shared/channels';
import { DEFAULT_REGION } from '../shared/defaults';
import { shouldShowOverlay } from '../shared/overlay';
import {
  profileSchema,
  regionSchema,
  settingsSchema,
  previewSignalSchema,
  previewSourceSchema,
} from '../shared/types';
import type { CaptureCommand, Dialogue, SessionSnapshot } from '../shared/types';

const BACKGROUND_CONNECTIONS = 4;

if (process.env.TRANSLATE_GAME_DATA_DIR)
  app.setPath('userData', process.env.TRANSLATE_GAME_DATA_DIR);
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

void app
  .whenReady()
  .then(async () => {
    protocol.handle('app', (request) => {
      const base = resolve(__dirname, '../renderer');
      const file = resolve(base, `.${decodeURIComponent(new URL(request.url).pathname)}`);
      if (!file.startsWith(`${base}${sep}`)) return new Response('', { status: 403 });
      return net.fetch(pathToFileURL(file).href);
    });
    const db = openDatabase(join(app.getPath('userData'), 'translate-game.sqlite'));
    let main: BrowserWindow | null = null;
    let capture: BrowserWindow | null = null;
    let overlay: BrowserWindow | null = null;
    let testWindow: BrowserWindow | null = null;
    let selectedSource = '';
    let command: CaptureCommand = { action: 'stop' };
    let previewRequest: string | null = null;
    const keysInMemory = new Map<string, string>();
    let shuttingDown = false;
    let normalOverlayBounds: Electron.Rectangle | null = null;
    /** Đưa vị trí đã lưu về màn hình chính nếu màn hình cũ không còn. */
    function availableOverlayBounds(bounds: Electron.Rectangle): Electron.Rectangle {
      const visible = screen
        .getAllDisplays()
        .some(
          ({ bounds: display }) =>
            bounds.x < display.x + display.width &&
            bounds.x + bounds.width > display.x &&
            bounds.y < display.y + display.height &&
            bounds.y + bounds.height > display.y,
        );
      if (visible) return bounds;
      const work = screen.getPrimaryDisplay().workArea;
      return {
        ...bounds,
        x: work.x + Math.round((work.width - bounds.width) / 2),
        y: work.y + Math.max(0, work.height - bounds.height - 50),
      };
    }
    /** Đổi kích thước overlay mà vẫn giữ vị trí của chế độ thông thường. */
    function applyOverlayMode(fullscreen: boolean): void {
      if (!overlay || overlay.isDestroyed()) return;
      if (fullscreen) {
        const bounds = availableOverlayBounds(normalOverlayBounds ?? overlay.getBounds());
        normalOverlayBounds = bounds;
        db.writeValue('overlayBounds', JSON.stringify(bounds));
        overlay.setBounds(screen.getDisplayMatching(bounds).bounds);
      } else if (normalOverlayBounds) {
        overlay.setBounds(availableOverlayBounds(normalOverlayBounds));
        normalOverlayBounds = null;
      }
    }
    screen.on('display-removed', () => {
      if (!overlay || overlay.isDestroyed()) return;
      if (controller.snapshot().settings.overlayFullscreen) applyOverlayMode(true);
      else overlay.setBounds(availableOverlayBounds(overlay.getBounds()));
    });
    screen.on('display-metrics-changed', () => {
      if (overlay && !overlay.isDestroyed() && controller.snapshot().settings.overlayFullscreen)
        applyOverlayMode(true);
    });
    /** Giải mã key tại main; máy khác không đọc được ciphertext. */
    function getKey(provider: 'openRouter' | 'lmStudio' | 'ollama' = 'openRouter'): string {
      const memory = keysInMemory.get(provider);
      if (memory !== undefined) return memory;
      const encrypted = db.readValue(
        provider === 'lmStudio'
          ? 'encryptedLmStudioToken'
          : provider === 'ollama'
            ? 'encryptedOllamaToken'
            : 'encryptedKey',
      );
      if (!encrypted || !safeStorage.isEncryptionAvailable()) return '';
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch {
        return '';
      }
    }
    const connection = createOpenRouterTransport();
    const backgroundConnection = createOpenRouterTransport(BACKGROUND_CONNECTIONS);
    const debugLog = !app.isPackaged
      ? new DebugLog((entries) => {
          if (main && !main.isDestroyed()) main.webContents.send(CHANNELS.debugChanged, entries);
        })
      : undefined;
    const api = new OpenRouter(
      () => getKey(db.settings().provider),
      connection.fetch,
      backgroundConnection.fetch,
      debugLog,
      () => ({
        provider: db.settings().provider,
        baseUrl:
          db.settings().provider === 'lmStudio'
            ? db.settings().lmStudioBaseUrl
            : db.settings().provider === 'ollama'
              ? db.settings().ollamaBaseUrl
              : OPENROUTER_ENDPOINT,
      }),
    );
    /** Generation thuộc vòng đời video, độc lập với generation xử lý OCR. */
    function previewGeneration(): number | undefined {
      if (command.action === 'preview') return command.generation;
      if (command.action === 'start') return command.previewGeneration ?? command.generation;
      return undefined;
    }
    /** Ghép trạng thái công khai của phiên và video, không chứa secret. */
    function publicSnapshot(): SessionSnapshot {
      return {
        ...controller.snapshot(),
        previewGeneration: previewGeneration(),
        hasLmStudioToken: Boolean(getKey('lmStudio')),
        hasOllamaToken: Boolean(getKey('ollama')),
        modelOptions,
      };
    }
    /** Phát snapshot không chứa secret, chỉ đến cửa sổ ứng dụng đang sống. */
    function broadcast(): void {
      const state = publicSnapshot();
      for (const win of [main, overlay])
        if (win && !win.isDestroyed()) win.webContents.send(CHANNELS.state, state);
      if (overlay) updateOverlayVisibility(overlay, shouldShowOverlay(state));
    }
    const controller = new SessionController(db, api, broadcast);
    /** Cache danh sách thuộc đúng nhà cung cấp và server đã cấu hình. */
    function modelCacheKey(): string {
      const identity = providerIdentity(db.settings());
      return identity === 'openRouter' ? 'modelOptions' : `modelOptions:${identity}`;
    }
    const modelOptions = z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          architecture: z.string().optional(),
          contextLength: z.number().optional(),
          isFree: z.boolean().default(false),
          supportsStructuredOutputs: z.boolean().default(true),
          inputPricePerMillion: z.number().nonnegative().optional(),
          outputPricePerMillion: z.number().nonnegative().optional(),
        }),
      )
      .parse(JSON.parse(db.readValue(modelCacheKey()) ?? '[]'));
    api.setModels(modelOptions);
    const selectedModel = modelOptions.find(
      (m) => m.id === effectiveModel(controller.snapshot().settings),
    );
    if (selectedModel) controller.setModelLimit(selectedModel.contextLength);
    controller.setModelLimits(modelOptions);
    let modelAbort: AbortController | undefined;
    let modelGeneration = 0;
    let modelRequest: ReturnType<typeof api.models> | undefined;
    /** Tải danh sách nền, giữ cache khi lỗi và ghép các yêu cầu đồng thời. */
    async function refreshModels(): ReturnType<typeof api.models> {
      if (modelRequest) return modelRequest;
      const generation = ++modelGeneration;
      modelAbort = new AbortController();
      const signal = modelAbort.signal;
      const request = (async () => {
        const identity = providerIdentity(db.settings());
        const models = await api.models(signal);
        if (
          shuttingDown ||
          generation !== modelGeneration ||
          identity !== providerIdentity(db.settings())
        )
          throw new Error('CANCELLED');
        modelOptions.splice(0, modelOptions.length, ...models);
        db.writeValue(modelCacheKey(), JSON.stringify(models));
        const selected = models.find(
          (m) => m.id === effectiveModel(controller.snapshot().settings),
        );
        if (selected) controller.setModelLimit(selected.contextLength);
        controller.setModelLimits(models);
        broadcast();
        return models;
      })();
      modelRequest = request;
      try {
        return await request;
      } finally {
        if (modelRequest === request) modelRequest = undefined;
      }
    }
    /** Đồng bộ nativeTheme với lựa chọn người dùng trước khi cửa sổ hiển thị. */
    function environment(): void {
      nativeTheme.themeSource = controller.snapshot().settings.theme;
      controller.environment(nativeTheme.shouldUseDarkColors, Boolean(getKey()));
    }
    /** Dừng stream và vô hiệu mọi request thuộc generation cũ. */
    function stop(status: 'idle' | 'paused' | 'error' = 'idle'): void {
      previewRequest = null;
      command = { action: 'stop' };
      capture?.webContents.send(CHANNELS.captureCommand, command);
      controller.stop(status);
    }
    /** Xác nhận nguồn còn tồn tại rồi bắt đầu capture độc lập với API dịch. */
    async function start(): Promise<void> {
      previewRequest = null;
      if (!selectedSource) throw new Error('CAPTURE');
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 },
      });
      const source = sources.find((s) => s.id === selectedSource);
      if (!source) throw new Error('CAPTURE');
      controller.captureSource(selectedSource, source.name);
      const existingPreview =
        command.action === 'preview' && command.sourceId === selectedSource
          ? command.generation
          : undefined;
      if (existingPreview === undefined) stop();
      const generation = controller.begin();
      command = {
        action: 'start',
        sourceId: selectedSource,
        generation,
        region: controller.snapshot().region ?? DEFAULT_REGION,
        previewGeneration: existingPreview ?? generation,
      };
      capture?.webContents.send(CHANNELS.captureCommand, command);
      broadcast();
    }
    /** Tạm dừng chỉ hủy OCR/dịch; preview và generation video giữ nguyên để tiếp tục ngay. */
    async function pause(): Promise<void> {
      if (controller.snapshot().status === 'paused') await start();
      else if (command.action === 'start') {
        command = {
          action: 'preview',
          sourceId: command.sourceId,
          generation: command.previewGeneration ?? command.generation,
        };
        capture?.webContents.send(CHANNELS.captureCommand, command);
        controller.stop('paused');
      } else stop('paused');
      if (controller.snapshot().status === 'paused') controller.runBackground();
    }
    /** Đăng ký cả hai phím tắt nguyên tử và phục hồi khi lựa chọn bị xung đột. */
    function shortcuts(translate: string, toggle: string): void {
      globalShortcut.unregisterAll();
      if (
        translate === toggle ||
        !globalShortcut.register(translate, () =>
          capture?.webContents.send(CHANNELS.captureCommand, { action: 'recognize' }),
        ) ||
        !globalShortcut.register(toggle, () => {
          void pause().catch(() => controller.fail('CAPTURE'));
        })
      ) {
        globalShortcut.unregisterAll();
        throw new Error('SHORTCUT');
      }
    }
    const mainOwners = (): Electron.WebContents[] =>
      main && !main.isDestroyed() ? [main.webContents] : [];
    const visibleOwners = (): Electron.WebContents[] =>
      [main, overlay]
        .filter((w): w is BrowserWindow => Boolean(w && !w.isDestroyed()))
        .map((w) => w.webContents);
    const captureOwners = (): Electron.WebContents[] =>
      capture && !capture.isDestroyed() ? [capture.webContents] : [];
    const overlayOwners = (): Electron.WebContents[] =>
      overlay && !overlay.isDestroyed() ? [overlay.webContents] : [];

    handle(CHANNELS.debugLogs, mainOwners, z.undefined(), () => debugLog?.snapshot() ?? null);
    handle(CHANNELS.debugClear, mainOwners, z.undefined(), () => {
      debugLog?.clear();
    });
    handle(CHANNELS.snapshot, visibleOwners, z.undefined(), publicSnapshot);
    handle(CHANNELS.sources, mainOwners, z.undefined(), async () => {
      const ownIds = new Set(
        [main, capture, overlay]
          .filter((w): w is BrowserWindow => Boolean(w && !w.isDestroyed()))
          .map((w) => w.getMediaSourceId()),
      );
      return listCaptureSources(ownIds);
    });
    handle(CHANNELS.previewSource, mainOwners, previewSourceSchema, async ({ sourceId, id }) => {
      const status = controller.snapshot().status;
      if (sourceId === null) {
        if (previewRequest === id) {
          previewRequest = null;
          if (command.action === 'preview') stop(status === 'paused' ? 'paused' : 'idle');
        }
        return controller.snapshot().generation;
      }
      if (status === 'running' || status === 'starting') throw new Error('INVALID_INPUT');
      previewRequest = id;
      if (command.action === 'preview' && command.sourceId === sourceId) return command.generation;
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 },
      });
      if (previewRequest !== id) throw new Error('CANCELLED');
      const ownIds = [main, capture, overlay]
        .filter((win): win is BrowserWindow => Boolean(win && !win.isDestroyed()))
        .map((win) => win.getMediaSourceId());
      const source = sources.find(
        (source) => source.id === sourceId && !ownIds.includes(source.id),
      );
      if (!source) throw new Error('CAPTURE');
      stop(status === 'paused' ? 'paused' : 'idle');
      previewRequest = id;
      selectedSource = source.id;
      controller.captureSource(source.id, source.name);
      const generation = controller.snapshot().generation;
      command = {
        action: 'preview',
        sourceId: source.id,
        generation,
      };
      capture?.webContents.send(CHANNELS.captureCommand, command);
      broadcast();
      return generation;
    });
    handle(CHANNELS.settings, mainOwners, settingsSchema, (value) => {
      const previous = controller.snapshot().settings;
      const connectionChanged = providerIdentity(value) !== providerIdentity(previous);
      const activeFields =
        value.provider === 'ollama'
          ? (['ollamaModel', 'ollamaSummaryModel', 'ollamaProfileModel'] as const)
          : value.provider === 'lmStudio'
            ? (['lmStudioModel', 'lmStudioSummaryModel', 'lmStudioProfileModel'] as const)
            : (['model', 'summaryModel', 'profileModel'] as const);
      const model = connectionChanged
        ? undefined
        : modelOptions.find((m) => m.id === effectiveModel(value));
      if (!connectionChanged)
        for (const field of activeFields)
          if (
            value[field] &&
            value[field] !== previous[field] &&
            !modelOptions.some((m) => m.id === value[field])
          )
            throw new Error('MODEL');
      try {
        shortcuts(value.translateShortcut, value.pauseShortcut);
      } catch (error) {
        shortcuts(previous.translateShortcut, previous.pauseShortcut);
        throw error;
      }
      if (connectionChanged || effectiveModel(value) !== effectiveModel(previous)) stop('paused');
      if (value.overlayFullscreen !== previous.overlayFullscreen) {
        if (value.overlayFullscreen && controller.snapshot().overlayEditing) {
          overlay?.setIgnoreMouseEvents(true, { forward: true });
          overlay?.setFocusable(false);
          controller.overlay(false);
        }
        applyOverlayMode(value.overlayFullscreen);
      }
      if (connectionChanged) {
        modelAbort?.abort();
        modelGeneration++;
        modelRequest = undefined;
        modelOptions.splice(0);
        api.setModels([]);
      }
      controller.updateSettings(value);
      if (connectionChanged) {
        controller.setModelLimits([]);
        void refreshModels().catch(() => undefined);
      }
      if (!connectionChanged) controller.setModelLimit(model?.contextLength);
      environment();
    });
    handle(
      CHANNELS.key,
      mainOwners,
      z.object({
        key: z.string().max(1000),
        provider: z.enum(['openRouter', 'lmStudio', 'ollama']),
      }),
      ({ key: value, provider }) => {
        stop('paused');
        if (value && !safeStorage.isEncryptionAvailable()) throw new Error('STORAGE');
        const keyInMemory = value.trim();
        keysInMemory.set(provider, keyInMemory);
        db.writeValue(
          provider === 'lmStudio'
            ? 'encryptedLmStudioToken'
            : provider === 'ollama'
              ? 'encryptedOllamaToken'
              : 'encryptedKey',
          keyInMemory ? safeStorage.encryptString(keyInMemory).toString('base64') : '',
        );
        environment();
      },
    );
    handle(CHANNELS.models, mainOwners, z.undefined(), refreshModels);
    handle(CHANNELS.profileSave, mainOwners, profileSchema, (profile) => {
      db.saveProfile(profile);
      if (controller.snapshot().session?.profileId === profile.id) stop('paused');
      controller.profileChanged(profile.id);
    });
    handle(
      CHANNELS.profileClear,
      mainOwners,
      z.object({ id: z.string().min(1).max(100), revision: z.number().int().nonnegative() }),
      ({ id, revision }) => {
        db.clearProfile(id, revision);
        if (controller.snapshot().session?.profileId === id) stop('paused');
        controller.profileCleared(id);
      },
    );
    handle(CHANNELS.profileRetry, mainOwners, z.string().min(1).max(100), (id) =>
      controller.retryProfile(id),
    );
    handle(
      CHANNELS.profileResolve,
      mainOwners,
      z.object({ id: z.string().min(1).max(100), action: z.enum(['accept', 'reject']) }),
      ({ id, action }) => {
        const proposal = db.profileProposals().find((item) => item.id === id);
        if (!proposal) throw new Error('INVALID_INPUT');
        db.resolveProfileProposal(id, action);
        controller.profileChanged(proposal.profileId);
      },
    );
    handle(CHANNELS.profileDelete, mainOwners, z.string().max(100), (id) => {
      if (controller.snapshot().session?.profileId === id) {
        stop();
        controller.clearSession();
      }
      db.deleteProfile(id);
      controller.profileChanged(id);
    });
    handle(
      CHANNELS.session,
      mainOwners,
      z.object({ profileId: z.string().max(100), resumeId: z.string().max(100).optional() }),
      ({ profileId, resumeId }) => {
        stop();
        controller.openSession(profileId, resumeId);
      },
    );
    handle(CHANNELS.reset, mainOwners, z.undefined(), () => {
      stop();
      controller.reset();
    });
    handle(
      CHANNELS.profileRegion,
      mainOwners,
      z.object({ profileId: z.string().min(1).max(100), region: regionSchema }),
      ({ profileId, region }) => controller.setProfileRegion(profileId, region),
    );
    handle(
      CHANNELS.start,
      mainOwners,
      z.object({ sourceId: z.string().max(200), region: regionSchema }),
      async ({ sourceId, region }) => {
        selectedSource = sourceId;
        const profileId = controller.snapshot().session?.profileId;
        if (!profileId) throw new Error('INVALID_INPUT');
        controller.setProfileRegion(profileId, region);
        await start();
      },
    );
    handle(CHANNELS.control, mainOwners, z.enum(['stop', 'pause', 'translate']), async (action) => {
      if (action === 'stop') {
        stop();
        controller.runBackground();
      } else if (action === 'pause') await pause();
      else capture?.webContents.send(CHANNELS.captureCommand, { action: 'recognize' });
    });
    const editSchema = z.object({
      id: z.string(),
      text: z.string().max(12000),
      translation: z.string().max(12000),
      speaker: z.string().max(100),
      listener: z.string().max(100),
    });
    handle(CHANNELS.edit, mainOwners, editSchema, (value) => {
      const current = controller.snapshot().dialogues.find((d) => d.id === value.id);
      if (!current) throw new Error('INVALID_INPUT');
      stop('paused');
      controller.edit({ ...current, ...value } as Dialogue);
    });
    handle(CHANNELS.retry, mainOwners, z.string().max(100), (id) => controller.retry(id));
    handle(CHANNELS.overlay, visibleOwners, z.boolean(), (editing) => {
      if (controller.snapshot().settings.overlayFullscreen) return;
      overlay?.setIgnoreMouseEvents(!editing, { forward: true });
      overlay?.setFocusable(editing);
      controller.overlay(editing);
      if (!editing && overlay) db.writeValue('overlayBounds', JSON.stringify(overlay.getBounds()));
    });
    handle(CHANNELS.overlayPointer, overlayOwners, z.boolean(), (active) => {
      if (controller.snapshot().settings.overlayFullscreen)
        overlay?.setIgnoreMouseEvents(!active, { forward: true });
    });
    handle(CHANNELS.closeFullscreenOverlay, overlayOwners, z.undefined(), () => {
      const settings = controller.snapshot().settings;
      if (!settings.overlayFullscreen) return;
      overlay?.setIgnoreMouseEvents(true, { forward: true });
      applyOverlayMode(false);
      controller.updateSettings({ ...settings, overlayFullscreen: false });
    });
    handle(CHANNELS.testSource, mainOwners, z.undefined(), async () => {
      if (!testWindow || testWindow.isDestroyed()) testWindow = await createWindow('test');
      else testWindow.show();
    });
    handle(CHANNELS.captureCommand, captureOwners, z.undefined(), () => command);
    handle(CHANNELS.captureReady, captureOwners, z.number().int(), (generation) => {
      if (command.action === 'start' && generation === command.generation)
        controller.ready(generation);
    });
    handle(
      CHANNELS.captureResult,
      captureOwners,
      z.object({
        text: z.string().max(12000),
        generation: z.number().int(),
        ms: z.number().nonnegative(),
        manual: z.boolean(),
      }),
      (value) => {
        if (command.action === 'start' && value.generation === command.generation)
          controller.ocr(value.text, value.generation, value.ms, value.manual);
      },
    );
    handle(
      CHANNELS.captureError,
      captureOwners,
      z.object({ code: z.enum(['CAPTURE', 'OCR']), generation: z.number().int() }),
      ({ code, generation }) => {
        if (command.action === 'preview') {
          if (code !== 'CAPTURE' || generation !== command.generation) return;
        } else if (generation !== controller.snapshot().generation) return;
        stop('error');
        controller.fail(code);
      },
    );
    ipcMain.on(CHANNELS.preview, (event, payload: unknown) => {
      if (
        event.senderFrame !== event.sender.mainFrame ||
        (command.action !== 'start' && command.action !== 'preview')
      )
        return;
      const parsed = previewSignalSchema.safeParse(payload);
      if (!parsed.success || parsed.data.generation !== previewGeneration()) return;
      const type = parsed.data.message.type;
      if (event.sender === main?.webContents && ['request', 'close', 'answer'].includes(type))
        capture?.webContents.send(CHANNELS.preview, parsed.data);
      else if (event.sender === capture?.webContents && ['offer', 'unavailable'].includes(type))
        main?.webContents.send(CHANNELS.preview, parsed.data);
    });
    electronSession.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback) =>
        callback(
          capturePermission(
            webContents.id,
            capture?.webContents.id,
            permission,
            command.action === 'start' || command.action === 'preview',
          ),
        ),
    );
    electronSession.defaultSession.setPermissionCheckHandler((webContents, permission) =>
      capturePermission(
        webContents?.id,
        capture?.webContents.id,
        permission,
        command.action === 'start' || command.action === 'preview',
      ),
    );
    electronSession.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      if (
        request.frame !== capture?.webContents.mainFrame ||
        (command.action !== 'start' && command.action !== 'preview')
      ) {
        callback({});
        return;
      }
      const requestedCommand = command;
      void desktopCapturer
        .getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => {
          const source = sources.find((source) => source.id === requestedCommand.sourceId);
          if (command !== requestedCommand) {
            callback({});
            return;
          }
          callback(source ? { video: source } : {});
        })
        .catch(() => callback({}));
    });
    environment();
    capture = await createWindow('capture', (win) => {
      capture = win;
    });
    overlay = await createWindow('overlay', (win) => {
      overlay = win;
    });
    const bounds = z
      .object({
        x: z.number().int(),
        y: z.number().int(),
        width: z.number().int().min(300),
        height: z.number().int().min(100),
      })
      .safeParse(JSON.parse(db.readValue('overlayBounds') ?? 'null'));
    if (bounds.success) overlay.setBounds(availableOverlayBounds(bounds.data));
    if (controller.snapshot().settings.overlayFullscreen) applyOverlayMode(true);
    broadcast();
    main = await createWindow('main', (win) => {
      main = win;
    });
    void refreshModels().catch(() => undefined);
    try {
      shortcuts(
        controller.snapshot().settings.translateShortcut,
        controller.snapshot().settings.pauseShortcut,
      );
    } catch {
      controller.fail('SHORTCUT');
    }
    nativeTheme.on('updated', () =>
      controller.environment(nativeTheme.shouldUseDarkColors, Boolean(getKey())),
    );
    main.on('closed', () => {
      if (!shuttingDown) app.quit();
    });
    capture.webContents.on('render-process-gone', () => {
      stop('error');
      controller.fail('CAPTURE');
    });
    app.on('before-quit', () => {
      if (shuttingDown) return;
      shuttingDown = true;
      stop();
      void connection.dispose().catch(() => console.error('Không thể đóng pool OpenRouter.'));
      void backgroundConnection
        .dispose()
        .catch(() => console.error('Không thể đóng pool nền OpenRouter.'));
      globalShortcut.unregisterAll();
      modelAbort?.abort();
      keysInMemory.clear();
      db.close();
    });
  })
  .catch((error: unknown) => {
    console.error(`Khởi động thất bại: ${errorCode(error)}`);
    if (process.env.TRANSLATE_GAME_DATA_DIR) console.error(error);
    app.quit();
  });
app.on('window-all-closed', () => app.quit());
