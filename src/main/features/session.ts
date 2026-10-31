import { effectiveModel, hasProviderAccess, providerIdentity } from '../../shared/modelSettings';
import { randomUUID } from 'node:crypto';
import type { AppDatabase } from '../database';
import type {
  AppError,
  AppSettings,
  CaptureRegion,
  Dialogue,
  SessionSnapshot,
} from '../../shared/types';
import {
  DEFAULT_REGION,
  INPUT_TOKEN_LIMIT,
  QUEUE_LIMIT,
  STABLE_TEXT_MS,
  SUMMARY_INTERVAL,
} from '../../shared/defaults';
import { TextStabilizer, TranslationQueue, normalizeText, isSimilarText } from './translation';
import { buildMessages, cacheKey } from './context';
import type { OpenRouter } from './openRouter';
import { backgroundInputLimit } from './openRouter';
import { getOverlayText } from '../../shared/overlay';
import { isTranslatableText } from '../../shared/ocrFilter';
import { ProfileTasks } from './profileTasks';

const TRANSLATION_PREVIEW_INTERVAL_MS = 100;

/** Chuyển lỗi nội bộ về mã giao diện, không truyền stack hoặc dữ liệu bí mật. */
export function errorCode(error: unknown): AppError {
  const codes: AppError[] = [
    'INVALID_INPUT',
    'FORBIDDEN',
    'API_KEY',
    'MODEL',
    'NETWORK',
    'TIMEOUT',
    'RATE_LIMIT',
    'RESPONSE',
    'CONTEXT_LIMIT',
    'CAPTURE',
    'OCR',
    'SHORTCUT',
    'STORAGE',
    'PROFILE_CHANGED',
  ];
  return error instanceof Error && codes.includes(error.message as AppError)
    ? (error.message as AppError)
    : 'INTERNAL';
}

/** Điều phối trạng thái phiên duy nhất; không phụ thuộc cửa sổ Electron để kiểm thử được. */
export class SessionController {
  private state: SessionSnapshot;
  private stabilizer = new TextStabilizer(STABLE_TEXT_MS);
  private queue: TranslationQueue<Dialogue>;
  private summaryTask: AbortController | null = null;
  private modelLimit = INPUT_TOKEN_LIMIT;
  private modelLimits = new Map<string, number | undefined>();
  private readonly profileTasks: ProfileTasks;
  private duplicateAnchor: Dialogue | null = null;
  private overlayContent = '';
  private overlayUpdatedAt = 0;
  private overlayTimer: ReturnType<typeof setTimeout> | undefined;

  /** Nạp cấu hình, chưa tự tạo capture hoặc gửi yêu cầu trả phí. */
  constructor(
    private readonly db: AppDatabase,
    private readonly api: OpenRouter,
    private readonly changed: () => void,
  ) {
    const selectedSession = db
      .sessions()
      .find((session) => session.id === db.readValue('selectedSession'));
    this.state = {
      settings: db.settings(),
      resolvedTheme: 'light',
      hasApiKey: false,
      profiles: db.profiles(),
      sessions: db.sessions(),
      session: selectedSession ?? null,
      status: 'idle',
      dialogues: selectedSession ? db.dialogues(selectedSession.id) : [],
      ocrText: '',
      error: null,
      overlayEditing: false,
      overlayText: '',
      generation: 0,
      sourceId: '',
      sourceName: '',
      region: selectedSession
        ? (db.profileRegion(selectedSession.profileId) ?? DEFAULT_REGION)
        : DEFAULT_REGION,
    };
    this.profileTasks = new ProfileTasks(
      db,
      api,
      () => this.state.settings,
      () => this.state.session,
      () => hasProviderAccess(this.state.settings, this.state.hasApiKey),
      (model) => this.backgroundLimit(model, 'profile'),
      () => this.emit(),
      errorCode,
    );
    this.queue = new TranslationQueue(
      (d, signal) => this.translate(d, signal),
      (d) => {
        d.status = this.state.status === 'running' ? 'skipped' : 'cancelled';
        this.db.saveDialogue(d);
        this.emit();
      },
      QUEUE_LIMIT,
    );
  }
  /** Snapshot công khai luôn là bản sao, không cho caller sửa trạng thái ngầm. */
  snapshot(): SessionSnapshot {
    return structuredClone({
      ...this.state,
      summaryLoading: this.summaryTask !== null,
      profileTasks: this.profileTasks.snapshot(),
      profileProposals: this.db.profileProposals(),
    });
  }
  /** Phát dữ liệu sau khi làm mới danh sách lưu trữ. */
  emit(): void {
    this.updateOverlay();
    this.state.profiles = this.db.profiles();
    this.state.sessions = this.db.sessions();
    this.changed();
  }
  /** Tự ẩn tại main; OCR lặp nguyên câu và thay theme không gia hạn caption. */
  private updateOverlay(): void {
    const text = ['starting', 'running'].includes(this.state.status)
      ? (!hasProviderAccess(this.state.settings, this.state.hasApiKey) ||
          !effectiveModel(this.state.settings)) &&
        this.state.ocrText &&
        !isTranslatableText(this.state.ocrText)
        ? this.overlayContent
        : getOverlayText(this.state)
      : '';
    if (text !== this.overlayContent) {
      this.overlayContent = text;
      this.overlayUpdatedAt = Date.now();
    }
    clearTimeout(this.overlayTimer);
    this.overlayTimer = undefined;
    const remaining =
      this.overlayUpdatedAt + this.state.settings.overlayDurationSeconds * 1000 - Date.now();
    this.state.overlayText = text && remaining > 0 ? text : '';
    if (this.state.overlayText) {
      this.overlayTimer = setTimeout(() => {
        this.overlayTimer = undefined;
        this.state.overlayText = '';
        this.changed();
      }, remaining);
      this.overlayTimer.unref?.();
    }
  }
  /** Cập nhật theme hệ thống và cờ có key, không cung cấp secret cho renderer. */
  environment(dark: boolean, hasKey: boolean): void {
    this.state.resolvedTheme = dark ? 'dark' : 'light';
    this.state.hasApiKey = hasKey;
    this.emit();
    this.profileTasks.wake();
  }
  /** Ghi cấu hình; đổi model làm vô hiệu kết quả đang dịch nhưng giữ hội thoại. */
  updateSettings(value: AppSettings): void {
    const connectionChanged = providerIdentity(value) !== providerIdentity(this.state.settings);
    if (connectionChanged) {
      this.stop('paused');
      this.summaryTask?.abort();
      this.summaryTask = null;
      this.profileTasks.cancel();
      this.setModelLimits([]);
    }
    const budgetChanged =
      value.profileInputTokenLimit !== this.state.settings.profileInputTokenLimit;
    if (
      effectiveModel(value) !== effectiveModel(this.state.settings) &&
      this.state.status !== 'idle'
    )
      this.stop('paused');
    if (
      effectiveModel(value, 'summary') !== effectiveModel(this.state.settings, 'summary') ||
      budgetChanged
    ) {
      this.summaryTask?.abort();
      this.summaryTask = null;
    }
    if (effectiveModel(value, 'profile') !== effectiveModel(this.state.settings, 'profile'))
      this.profileTasks.cancel();
    if (budgetChanged) this.profileTasks.changeBudget();
    this.db.saveSettings(value);
    this.state.settings = value;
    this.emit();
    this.profileTasks.wake();
    if (this.state.status === 'running') void this.summarize();
  }
  /** Lưu giới hạn thực của model để chừa chỗ cho output và metadata nhà cung cấp. */
  setModelLimit(contextLength: number | undefined): void {
    this.modelLimit =
      contextLength === undefined
        ? INPUT_TOKEN_LIMIT
        : Math.min(INPUT_TOKEN_LIMIT, Math.max(0, contextLength - 1536));
  }
  /** Nạp giới hạn từng model, dùng riêng cho dịch và từng tác vụ nền. */
  setModelLimits(models: { id: string; contextLength?: number }[]): void {
    this.modelLimits = new Map(models.map((model) => [model.id, model.contextLength]));
    const limit = this.modelLimits.get(effectiveModel(this.state.settings));
    this.setModelLimit(limit);
  }
  /** Chừa output và overhead theo model thực tế; không đoán model thay thế. */
  private backgroundLimit(model: string, purpose: 'summary' | 'profile' = 'summary'): number {
    return backgroundInputLimit(
      this.modelLimits.get(model),
      purpose,
      this.state.settings.profileInputTokenLimit,
    );
  }
  /** Sau khi sửa hồ sơ, hủy tác vụ cũ rồi bổ sung trên revision mới, không dừng capture. */
  profileChanged(profileId: string): void {
    this.profileTasks.refresh(profileId);
    this.emit();
  }
  /** Hủy dữ kiện AI đang xử lý sau khi hồ sơ được xóa, không khởi tạo lại tự động. */
  profileCleared(profileId: string): void {
    this.profileTasks.cleared(profileId);
    this.emit();
  }
  /** Người dùng yêu cầu thử lại lô hồ sơ lỗi hoặc chờ cấu hình. */
  retryProfile(profileId: string): void {
    this.profileTasks.retry(profileId);
    this.emit();
  }
  /** Giữ nguồn và vùng chọn qua các lần chuyển màn hình trong cùng phiên ứng dụng. */
  captureSource(sourceId: string, sourceName: string): void {
    if (sourceId !== this.state.sourceId) this.duplicateAnchor = null;
    this.state.sourceId = sourceId;
    this.state.sourceName = sourceName;
    this.emit();
  }
  /** Lưu vùng dịch theo hồ sơ, kể cả khi kết quả đến sau lúc chuyển hồ sơ. */
  setProfileRegion(profileId: string, region: CaptureRegion): void {
    this.db.saveProfileRegion(profileId, region);
    if (this.state.session?.profileId === profileId) {
      this.state.region = region;
      this.emit();
    }
  }
  /** Mở hoặc tiếp tục phiên; không tự bật capture. */
  openSession(profileId: string, resumeId?: string): void {
    if (!this.db.profiles().some((p) => p.id === profileId)) throw new Error('INVALID_INPUT');
    const resumed = resumeId
      ? this.db.sessions().find((s) => s.id === resumeId && s.profileId === profileId)
      : undefined;
    if (resumeId && !resumed) throw new Error('INVALID_INPUT');
    this.stop();
    this.state.session = resumed ?? this.db.createSession(profileId);
    this.db.writeValue('selectedSession', this.state.session.id);
    this.state.region = this.db.profileRegion(profileId) ?? DEFAULT_REGION;
    this.state.dialogues = this.db.dialogues(this.state.session.id);
    this.state.ocrText = '';
    this.emit();
  }
  /** Bỏ phiên đang chọn khi hồ sơ sở hữu bị xóa. */
  clearSession(): void {
    this.stop();
    this.state.session = null;
    this.state.region = DEFAULT_REGION;
    this.state.dialogues = [];
    this.db.writeValue('selectedSession', '');
    this.emit();
  }
  /** Bắt đầu generation mới và chờ capture renderer báo sẵn sàng. */
  begin(): number {
    if (!this.state.session) throw new Error('INVALID_INPUT');
    this.stop();
    this.state.status = 'starting';
    this.state.error = null;
    this.emit();
    return this.state.generation;
  }
  /** Chỉ generation hiện tại có thể chuyển phiên thành đang chạy. */
  ready(generation: number): void {
    if (generation === this.state.generation && this.state.status === 'starting') {
      this.state.status = 'running';
      this.emit();
      this.profileTasks.wake();
      void this.summarize();
    }
  }
  /** Hủy phiên xử lý, không xóa hội thoại đã dịch. */
  stop(status: 'idle' | 'paused' | 'error' = 'idle'): void {
    this.duplicateAnchor = null;
    this.state.generation++;
    this.state.status = status;
    this.summaryTask?.abort();
    this.summaryTask = null;
    this.profileTasks.cancel();
    this.queue.cancel();
    for (const d of this.state.dialogues)
      if (d.status === 'pending') {
        d.status = 'cancelled';
        d.translation = '';
        this.db.saveDialogue(d);
      }
    this.stabilizer = new TextStabilizer(STABLE_TEXT_MS);
    this.state.ocrText = '';
    this.emit();
  }
  /** Reset tạo phiên mới cho cùng hồ sơ, bảo toàn lịch sử phiên trước. */
  reset(): void {
    if (!this.state.session) throw new Error('INVALID_INPUT');
    this.openSession(this.state.session.profileId);
  }
  /** Cập nhật lỗi công khai; lỗi capture/OCR kết thúc generation đang chạy. */
  fail(code: AppError, stop = false): void {
    if (stop) this.stop('error');
    this.state.error = code;
    this.emit();
  }
  /** Nhận OCR đúng generation; chưa có key/model thì chỉ cập nhật chữ, không gọi API dịch. */
  ocr(text: string, generation: number, ms: number, manual = false): void {
    if (
      generation !== this.state.generation ||
      !['starting', 'running'].includes(this.state.status)
    )
      return;
    this.state.ocrText = normalizeText(text);
    if (!this.state.ocrText) this.duplicateAnchor = null;
    this.state.status = 'running';
    if (this.state.ocrText && !isTranslatableText(this.state.ocrText)) {
      this.emit();
      return;
    }
    const stable = this.stabilizer.accept(text, Date.now(), manual);
    if (
      hasProviderAccess(this.state.settings, this.state.hasApiKey) &&
      effectiveModel(this.state.settings) &&
      (manual || (stable && this.state.settings.autoTranslate))
    )
      this.enqueue(manual ? text : (stable ?? ''), ms, manual);
    this.emit();
  }
  /** Dịch lại đoạn lỗi theo ngữ cảnh hiện tại bằng một đoạn mới có thứ tự mới. */
  retry(id: string): void {
    const d = this.state.dialogues.find((item) => item.id === id);
    if (!d) throw new Error('INVALID_INPUT');
    this.enqueue(d.text, d.ocrMs, true);
  }
  /** Ghi sửa hội thoại rồi vô hiệu các request dùng ngữ cảnh trước khi sửa. */
  edit(value: Dialogue): void {
    const old = this.state.dialogues.find((d) => d.id === value.id);
    if (!old) throw new Error('INVALID_INPUT');
    this.stop('paused');
    Object.assign(old, {
      text: value.text,
      translation: value.translation,
      speaker: value.speaker || 'unknown',
      listener: value.listener || 'unknown',
    });
    if (old.translation) old.status = 'translated';
    this.db.saveDialogue(old);
    if (this.state.session) {
      this.state.session.summary = '';
      this.state.session.summarizedThrough = 0;
      this.db.saveSession(this.state.session);
    }
    this.emit();
  }
  /** Lưu trạng thái chỉnh overlay để các cửa sổ hiển thị nhất quán. */
  overlay(editing: boolean): void {
    this.state.overlayEditing = editing;
    this.emit();
  }
  /**
   * Lọc câu tự động theo mốc đã chấp nhận rồi thêm vào hàng đợi hữu hạn.
   * Câu bị bỏ không đổi mốc; force bỏ lọc gần giống nhưng vẫn chặn trùng nguyên văn đang pending.
   */
  private enqueue(input: string, ocrMs: number, force = false): void {
    const text = normalizeText(input);
    if (!isTranslatableText(text) || !this.state.session) return;
    const last = this.state.dialogues.at(-1);
    if (last?.status === 'pending' && last.text === text) return;
    if (
      !force &&
      this.duplicateAnchor &&
      ['pending', 'translated'].includes(this.duplicateAnchor.status) &&
      isSimilarText(this.duplicateAnchor.text, text, this.state.settings.duplicateThreshold)
    )
      return;
    if (!hasProviderAccess(this.state.settings, this.state.hasApiKey)) {
      this.fail('API_KEY');
      return;
    }
    if (!effectiveModel(this.state.settings)) {
      this.fail('MODEL');
      return;
    }
    const d: Dialogue = {
      id: randomUUID(),
      sessionId: this.state.session.id,
      sequence: (this.state.dialogues.at(-1)?.sequence ?? 0) + 1,
      text,
      translation: '',
      speaker: 'unknown',
      listener: 'unknown',
      status: 'pending',
      createdAt: Date.now(),
      ocrMs,
      apiMs: 0,
    };
    this.state.dialogues.push(d);
    this.duplicateAnchor = d;
    this.db.saveDialogue(d);
    this.queue.push(d);
    this.emit();
  }
  /** Dịch tuần tự và kiểm tra generation cả sau khi API trả về. */
  private async translate(d: Dialogue, signal: AbortSignal): Promise<void> {
    const generation = this.state.generation;
    const session = this.state.session;
    const profile = this.state.profiles.find((p) => p.id === session?.profileId);
    if (!session || !profile) return;
    const start = Date.now();
    d.queueMs = Math.max(0, start - d.createdAt);
    let lastPreview = -Infinity;
    try {
      const messages = buildMessages(
        profile,
        session.summary,
        this.state.dialogues.filter((h) => h.sequence < d.sequence),
        d.text,
        this.modelLimit,
        this.api.translationFormatInstruction(effectiveModel(this.state.settings)),
      );
      const key = cacheKey(
        d.text,
        effectiveModel(this.state.settings),
        profile,
        JSON.stringify({ provider: providerIdentity(this.state.settings), messages }),
      );
      const cached = this.db.cache(key);
      const result =
        cached ??
        (await this.api.translate(
          effectiveModel(this.state.settings),
          messages,
          signal,
          (text) => {
            if (
              signal.aborted ||
              generation !== this.state.generation ||
              !text ||
              text === d.translation
            )
              return;
            const now = Date.now();
            d.firstTextMs ??= Math.max(0, now - start);
            if (now - lastPreview < TRANSLATION_PREVIEW_INTERVAL_MS) return;
            lastPreview = now;
            d.translation = text;
            this.emit();
          },
          session.id,
        ));
      if (signal.aborted || generation !== this.state.generation) return;
      if (!cached) this.db.putCache(key, result);
      Object.assign(d, result, { status: 'translated', apiMs: Date.now() - start });
      if (cached) {
        d.fromCache = true;
        d.usage = { inputTokens: 0, outputTokens: 0 };
        d.costUsd = 0;
      }
      this.state.error = null;
    } catch (error) {
      if (signal.aborted || generation !== this.state.generation) return;
      d.status = 'error';
      d.translation = '';
      d.apiMs = Date.now() - start;
      d.error = errorCode(error);
      this.state.error = errorCode(error);
    } finally {
      if (generation === this.state.generation) {
        this.db.saveDialogue(d);
        this.emit();
        void this.summarize();
        this.profileTasks.wake();
      }
    }
  }
  /** Tóm tắt đủ lô trên kết nối nền, không chờ hàng đợi dịch rảnh. */
  private async summarize(): Promise<void> {
    const session = this.state.session;
    const rows = session
      ? this.db.translatedAfter(session.id, session.summarizedThrough, SUMMARY_INTERVAL)
      : [];
    const model = effectiveModel(this.state.settings, 'summary');
    if (!session || rows.length < SUMMARY_INTERVAL || this.summaryTask || !model) return;
    const controller = new AbortController();
    this.summaryTask = controller;
    this.emit();
    const generation = this.state.generation;
    let completed = false;
    try {
      const data = JSON.stringify({
        summary: session.summary,
        dialogues: rows.slice(0, SUMMARY_INTERVAL).map((d) => ({
          text: d.text,
          translation: d.translation,
          speaker: d.speaker,
          listener: d.listener,
        })),
      });
      if (Buffer.byteLength(data, 'utf8') > this.backgroundLimit(model)) return;
      const summary = await this.api.summarize(model, data, controller.signal, session.id);
      if (controller.signal.aborted || generation !== this.state.generation) return;
      session.summary = summary;
      session.summarizedThrough = rows[Math.min(rows.length, SUMMARY_INTERVAL) - 1].sequence;
      this.db.saveSession(session);
      completed = true;
      this.emit();
    } catch {
      /* Tóm tắt không được làm gián đoạn phụ đề; câu hoàn tất sau có thể thử lại. */
    } finally {
      if (this.summaryTask === controller) {
        this.summaryTask = null;
        this.emit();
      }
      if (completed && generation === this.state.generation) void this.summarize();
    }
  }
}
