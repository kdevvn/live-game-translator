import { effectiveModel } from '../../shared/modelSettings';
import type { AppDatabase } from '../database';
import type { AppError, AppSettings, ProfileTask, StoredSession } from '../../shared/types';
import type { OpenRouter } from './openRouter';

/** Điều phối một tác vụ hồ sơ tại một thời điểm, độc lập hàng đợi dịch và tóm tắt. */
export class ProfileTasks {
  private current: { profileId: string; controller: AbortController } | null = null;
  private states = new Map<string, ProfileTask>();
  private retryInitialization = new Set<string>();

  /** Dependency tường minh giúp kiểm tra HTTP giả lập, hủy và kết quả trả muộn. */
  constructor(
    private readonly db: AppDatabase,
    private readonly api: OpenRouter,
    private readonly settings: () => AppSettings,
    private readonly session: () => StoredSession | null,
    private readonly hasKey: () => boolean,
    private readonly limit: (model: string) => number,
    private readonly changed: () => void,
    private readonly errorCode: (error: unknown) => AppError,
  ) {}

  /** Trạng thái công khai theo hồ sơ, không cung cấp prompt hoặc khóa bí mật. */
  snapshot(): ProfileTask[] {
    return this.db
      .profiles()
      .filter((profile) => profile.aiEnabled ?? profile.id !== 'general')
      .map(
        (profile) =>
          this.states.get(profile.id) ?? {
            profileId: profile.id,
            status: this.db.profileWasCleared(profile.id)
              ? 'cleared'
              : this.db.profileHasNoInitialData(profile.id)
                ? 'no_data'
                : this.db.profileInitialized(profile.id)
                  ? 'completed'
                  : 'waiting',
            error: null,
          },
      );
  }

  /** Hủy request liên quan; guard identity ngăn response muộn ghi DB. */
  cancel(profileId?: string): void {
    for (const [id, state] of this.states) {
      if ((!profileId || id === profileId) && state.status === 'queued')
        this.states.set(id, { profileId: id, status: 'waiting', error: null });
    }
    if (profileId) this.retryInitialization.delete(profileId);
    else this.retryInitialization.clear();
    if (this.current && (!profileId || this.current.profileId === profileId)) {
      this.current.controller.abort();
      this.states.set(this.current.profileId, {
        profileId: this.current.profileId,
        status: 'waiting',
        error: null,
      });
      this.current = null;
    }
  }

  /** Chỉ người dùng thử lại mới xóa lỗi, tránh tự retry vô hạn mỗi câu OCR. */
  retry(profileId: string): void {
    const profile = this.db.profiles().find((item) => item.id === profileId);
    if (!profile || !(profile.aiEnabled ?? profile.id !== 'general'))
      throw new Error('INVALID_INPUT');
    if (this.current?.profileId === profileId || this.states.get(profileId)?.status === 'queued')
      return;
    if (this.db.profileInitialized(profileId) && this.states.get(profileId)?.status !== 'error')
      this.retryInitialization.add(profileId);
    this.states.set(profileId, { profileId, status: 'queued', error: null });
    this.changed();
    this.wake();
  }
  /** Lưu hoặc xóa thủ công làm cũ request và cho phép phân tích lại dữ liệu hiện tại. */
  refresh(profileId: string): void {
    this.cancel(profileId);
    this.states.delete(profileId);
    this.wake();
  }
  /** Bỏ request và trạng thái cũ sau khi xóa dữ kiện, rồi xử lý tác vụ khác đang chờ. */
  cleared(profileId: string): void {
    this.cancel(profileId);
    this.states.delete(profileId);
    this.wake();
  }
  /** Đổi ngân sách hủy request cũ và mở lại tác vụ chỉ bị lỗi giới hạn ngữ cảnh. */
  changeBudget(): void {
    this.cancel();
    for (const [id, state] of this.states)
      if (state.error === 'CONTEXT_LIMIT') this.states.delete(id);
  }

  /** Tìm lần khởi tạo hoặc lô hội thoại tiếp theo; không chờ dịch rảnh. */
  wake(): void {
    if (this.current) return;
    const settings = this.settings();
    const model = effectiveModel(settings, 'profile');
    const profiles = this.db
      .profiles()
      .filter(
        (profile) =>
          (profile.aiEnabled ?? profile.id !== 'general') &&
          this.states.get(profile.id)?.status !== 'error',
      );
    if (!this.hasKey() || !model) {
      for (const profile of profiles)
        this.states.set(profile.id, {
          profileId: profile.id,
          status: this.db.profileWasCleared(profile.id)
            ? 'cleared'
            : this.db.profileHasNoInitialData(profile.id)
              ? 'no_data'
              : 'waiting',
          error: null,
        });
      this.changed();
      return;
    }
    const session = this.session();
    const initial = profiles.find(
      (profile) =>
        (!this.db.profileInitialized(profile.id) || this.retryInitialization.has(profile.id)) &&
        profile.name.trim(),
    );
    const profile = initial ?? profiles.find((profile) => profile.id === session?.profileId);
    if (!profile) return;
    const rows =
      !initial && session
        ? this.db.translatedAfter(
            session.id,
            this.db.profileLearningThrough(session.id),
            settings.profileLearningInterval,
          )
        : [];
    if (!initial && rows.length < settings.profileLearningInterval) {
      if (this.states.get(profile.id)?.status === 'queued') {
        this.states.set(profile.id, { profileId: profile.id, status: 'waiting', error: null });
        this.changed();
      }
      return;
    }
    this.retryInitialization.delete(profile.id);
    const task = { profileId: profile.id, controller: new AbortController() };
    this.current = task;
    this.states.set(profile.id, { profileId: profile.id, status: 'running', error: null });
    this.changed();
    const data = JSON.stringify({
      mode: initial ? 'initialize' : 'learn',
      game: profile.name,
      profile: {
        instructions: profile.instructions,
        characters: profile.characters.map(({ name, aliases }) => ({ name, aliases })),
        relationships: profile.relationships,
        glossary: profile.glossary,
      },
      dialogues: rows
        .filter(
          ({ speaker, listener }) =>
            speaker.trim().toLowerCase() !== 'unknown' ||
            listener.trim().toLowerCase() !== 'unknown',
        )
        .map(({ text, translation, speaker, listener }) => ({
          text,
          translation,
          speaker,
          listener,
        })),
    });
    void this.execute(
      task,
      model,
      data,
      profile.revision,
      Boolean(initial),
      initial ? undefined : session?.id,
      rows.at(-1)?.sequence,
    );
  }

  /** Chỉ lưu lô còn hiệu lực; thành công mới tiến mốc và tiếp tục phần còn chờ. */
  private async execute(
    task: NonNullable<ProfileTasks['current']>,
    model: string,
    data: string,
    revision: number,
    initial: boolean,
    sessionId?: string,
    through?: number,
  ): Promise<void> {
    try {
      if (Buffer.byteLength(data, 'utf8') > this.limit(model)) throw new Error('CONTEXT_LIMIT');
      const facts = await this.api.enrichProfile(
        model,
        data,
        task.controller.signal,
        task.profileId,
      );
      if (this.current !== task || task.controller.signal.aborted) return;
      this.db.applyProfileEnrichment(task.profileId, revision, facts, sessionId, through);
      this.states.set(task.profileId, {
        profileId: task.profileId,
        status: this.db.profileWasCleared(task.profileId)
          ? 'cleared'
          : (initial &&
                !facts.characters.length &&
                !facts.relationships.length &&
                !facts.glossary.length) ||
              this.db.profileHasNoInitialData(task.profileId)
            ? 'no_data'
            : 'completed',
        error: null,
      });
    } catch (error) {
      if (this.current !== task || task.controller.signal.aborted) return;
      if (initial && this.db.profileInitialized(task.profileId))
        this.retryInitialization.add(task.profileId);
      this.states.set(task.profileId, {
        profileId: task.profileId,
        status: 'error',
        error: this.errorCode(error),
      });
    } finally {
      if (this.current === task) {
        this.current = null;
        this.changed();
        this.wake();
      }
    }
  }
}
