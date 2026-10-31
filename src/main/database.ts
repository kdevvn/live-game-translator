import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, CACHE_LIMIT, CACHE_TTL_MS } from '../shared/defaults';
import {
  profileSchema,
  regionSchema,
  profileEnrichmentSchema,
  profileProposalSchema,
  settingsSchema,
  translationCacheSchema,
} from '../shared/types';
import {
  mergeProfile,
  acceptProfileProposal,
  filterProfileEvidence,
} from './features/profileLearning';
import type {
  AppSettings,
  CaptureRegion,
  Dialogue,
  GameProfile,
  StoredSession,
  TranslationResult,
  ProfileEnrichment,
  ProfileProposal,
} from '../shared/types';

const PROFILE_REGION_PREFIX = 'profileRegion:';

/** Khôi phục giá trị hiển thị cho hội thoại lưu người chưa xác định bằng null. */
function readDialogue(value: string): Dialogue {
  const dialogue = JSON.parse(value) as Dialogue;
  return {
    ...dialogue,
    speaker: dialogue.speaker ?? 'unknown',
    listener: dialogue.listener ?? 'unknown',
  };
}

/** Chuyển nhãn không xác định thành null trong dữ liệu lưu. */
function storedPerson(value: string): string | null {
  return value.trim().toLowerCase() === 'unknown' || !value.trim() ? null : value;
}

/** Kết nối SQLite chỉ do main sở hữu; mọi document được parse từ cột JSON. */
export function openDatabase(path: string) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  /** Migration có transaction, không ghi đè dữ liệu đã tồn tại. */
  function migrate(): void {
    db.transaction(() => {
      const version = Number(db.pragma('user_version', { simple: true }));
      if (version > 2) throw new Error('STORAGE');
      if (version === 0) {
        db.exec(`CREATE TABLE settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE profiles (id TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE sessions (id TEXT PRIMARY KEY, profileId TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, value TEXT NOT NULL);
          CREATE TABLE dialogues (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, value TEXT NOT NULL);
          CREATE TABLE translation_cache (id TEXT PRIMARY KEY, value TEXT NOT NULL, createdAt INTEGER NOT NULL);
          CREATE INDEX dialogue_order ON dialogues(sessionId, sequence);
          PRAGMA user_version = 1;`);
      }
      if (version < 2) {
        db.exec(`CREATE TABLE profile_ai (profileId TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE, initialized INTEGER NOT NULL);
          CREATE TABLE profile_learning (sessionId TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, throughSequence INTEGER NOT NULL);
          CREATE TABLE profile_proposals (id TEXT PRIMARY KEY, profileId TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, value TEXT NOT NULL);
          UPDATE profiles SET value=json_set(value, '$.aiEnabled', json('true')) WHERE id!='general' AND json_extract(value, '$.aiEnabled') IS NULL;
          PRAGMA user_version = 2;`);
      }
      // Chỉ bỏ hồ sơ mặc định chưa được sử dụng; dữ liệu cũ có lịch sử được giữ lại.
      db.prepare(
        `DELETE FROM profiles WHERE id=? AND value=?
        AND NOT EXISTS (SELECT 1 FROM sessions WHERE profileId=profiles.id)
        AND NOT EXISTS (SELECT 1 FROM profile_ai WHERE profileId=profiles.id)`,
      ).run(DEFAULT_PROFILE.id, JSON.stringify(DEFAULT_PROFILE));
    })();
  }
  migrate();
  /** Đọc một giá trị JSON/chuỗi trong settings nội bộ. */
  function readValue(id: string): string | undefined {
    const row = db.prepare('SELECT value FROM settings WHERE id=?').get(id) as
      { value: string } | undefined;
    return row?.value;
  }
  /** Ghi một giá trị nội bộ; API key chỉ được truyền vào ở dạng mã hóa. */
  function writeValue(id: string, value: string): void {
    db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)').run(id, value);
  }
  /** Đọc hồ sơ sau validation để không phát dữ liệu hỏng qua IPC. */
  function profiles(): GameProfile[] {
    return (
      db.prepare('SELECT value FROM profiles ORDER BY rowid').all() as { value: string }[]
    ).map((row) => profileSchema.parse(JSON.parse(row.value)));
  }
  /** Đọc hội thoại đúng thứ tự, giới hạn mặc định bảo vệ payload UI. */
  function dialogues(sessionId: string, limit = 500): Dialogue[] {
    return (
      db
        .prepare(
          'SELECT value FROM (SELECT sequence,value FROM dialogues WHERE sessionId=? ORDER BY sequence DESC LIMIT ?) ORDER BY sequence',
        )
        .all(sessionId, limit) as { value: string }[]
    ).map((r) => readDialogue(r.value));
  }
  /** Danh sách phiên mới nhất phục vụ tiếp tục hội thoại. */
  function sessions(): StoredSession[] {
    return (
      db.prepare('SELECT value FROM sessions ORDER BY rowid DESC LIMIT 100').all() as {
        value: string;
      }[]
    ).map((r) => JSON.parse(r.value) as StoredSession);
  }
  /** Ghi snapshot phiên hoặc tóm tắt mới. */
  function saveSession(session: StoredSession): void {
    db.prepare(
      'INSERT INTO sessions VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
    ).run(session.id, session.profileId, JSON.stringify(session));
  }
  /** Liệt kê đề xuất pending hợp lệ; ẩn đề xuất quy tắc ưu tiên của phiên bản cũ. */
  function profileProposals(profileId?: string): ProfileProposal[] {
    const rows = profileId
      ? db.prepare('SELECT value FROM profile_proposals WHERE profileId=?').all(profileId)
      : db.prepare('SELECT value FROM profile_proposals').all();
    return (rows as { value: string }[])
      .map((row) => profileProposalSchema.parse(JSON.parse(row.value)))
      .filter((row) => row.status === 'pending' && row.field !== 'instructions');
  }
  return {
    migrate,
    readValue,
    writeValue,
    profiles,
    sessions,
    dialogues,
    /** Đọc đủ lô thành công từ DB, độc lập giới hạn lịch sử hiển thị. */
    translatedAfter(sessionId: string, after: number, limit: number): Dialogue[] {
      return (
        db
          .prepare(
            "SELECT value FROM dialogues WHERE sessionId=? AND sequence>? AND json_extract(value, '$.status')='translated' ORDER BY sequence LIMIT ?",
          )
          .all(sessionId, after, limit) as { value: string }[]
      ).map((row) => readDialogue(row.value));
    },
    saveSession,
    profileProposals,
    /** Mốc học riêng mỗi phiên, không dùng giới hạn lịch sử UI. */
    profileLearningThrough(sessionId: string): number {
      return (
        (
          db
            .prepare('SELECT throughSequence FROM profile_learning WHERE sessionId=?')
            .get(sessionId) as { throughSequence: number } | undefined
        )?.throughSequence ?? 0
      );
    },
    /** Khởi tạo thành công kể cả khi model không biết game và không bổ sung dữ kiện. */
    profileInitialized(profileId: string): boolean {
      return Boolean(
        (
          db.prepare('SELECT initialized FROM profile_ai WHERE profileId=?').get(profileId) as
            { initialized: number } | undefined
        )?.initialized,
      );
    },
    /** Lưu kết quả khởi tạo rỗng để vẫn học hội thoại và hiển thị sau khởi động lại. */
    profileHasNoInitialData(profileId: string): boolean {
      const row = db
        .prepare('SELECT initialized FROM profile_ai WHERE profileId=?')
        .get(profileId) as { initialized: number } | undefined;
      return row?.initialized === 2;
    },
    /** Nhận diện hồ sơ đã được người dùng xóa dữ kiện nhưng vẫn cho học hội thoại mới. */
    profileWasCleared(profileId: string): boolean {
      const row = db
        .prepare('SELECT initialized FROM profile_ai WHERE profileId=?')
        .get(profileId) as { initialized: number } | undefined;
      return row?.initialized === 3;
    },
    /** Xóa dữ kiện và đề xuất, giữ quy tắc và lịch sử; không học lại hội thoại cũ. */
    clearProfile(profileId: string, revision: number): void {
      db.transaction(() => {
        const profile = profiles().find((item) => item.id === profileId);
        if (!profile) throw new Error('INVALID_INPUT');
        if (profile.revision !== revision) throw new Error('PROFILE_CHANGED');
        const cleared = profileSchema.parse({
          ...profile,
          characters: [],
          relationships: [],
          glossary: [],
          revision: profile.revision + 1,
        });
        db.prepare('UPDATE profiles SET value=? WHERE id=?').run(
          JSON.stringify(cleared),
          profileId,
        );
        db.prepare('DELETE FROM profile_proposals WHERE profileId=?').run(profileId);
        db.prepare('INSERT OR REPLACE INTO profile_ai VALUES (?,3)').run(profileId);
        db.prepare(
          `INSERT INTO profile_learning (sessionId, throughSequence)
          SELECT id, COALESCE((SELECT MAX(sequence) FROM dialogues WHERE sessionId=sessions.id), 0)
          FROM sessions WHERE profileId=?
          ON CONFLICT(sessionId) DO UPDATE SET throughSequence=max(throughSequence,excluded.throughSequence)`,
        ).run(profileId);
      })();
    },
    /** Kiểm tra revision và ghi dữ kiện, đề xuất, mốc học trong cùng transaction. */
    applyProfileEnrichment(
      profileId: string,
      revision: number,
      input: ProfileEnrichment,
      sessionId?: string,
      through?: number,
    ): void {
      db.transaction(() => {
        const profile = profiles().find((item) => item.id === profileId);
        if (!profile) throw new Error('INVALID_INPUT');
        if (profile.revision !== revision) throw new Error('PROFILE_CHANGED');
        const parsed = profileEnrichmentSchema.parse(input);
        const dialogues =
          parsed.characters.length || parsed.glossary.length
            ? (db
                .prepare(
                  `SELECT json_extract(d.value, '$.text') AS text
          FROM dialogues d JOIN sessions s ON s.id=d.sessionId
          WHERE s.profileId=? AND json_extract(d.value, '$.status')='translated'`,
                )
                .all(profileId) as { text: string }[])
            : [];
        const facts = filterProfileEvidence(
          profile,
          parsed,
          dialogues.map((dialogue) => dialogue.text),
        );
        const merged = mergeProfile(profile, facts);
        const changed = JSON.stringify(merged.profile) !== JSON.stringify(profile);
        if (changed)
          db.prepare('UPDATE profiles SET value=? WHERE id=?').run(
            JSON.stringify({ ...merged.profile, revision: profile.revision + 1 }),
            profileId,
          );
        for (const proposal of merged.proposals)
          db.prepare('INSERT OR IGNORE INTO profile_proposals VALUES (?,?,?)').run(
            proposal.id,
            profileId,
            JSON.stringify(proposal),
          );
        if (sessionId !== undefined && through !== undefined) {
          const session = db.prepare('SELECT profileId FROM sessions WHERE id=?').get(sessionId) as
            { profileId: string } | undefined;
          if (session?.profileId !== profileId) throw new Error('INVALID_INPUT');
          db.prepare(
            'INSERT INTO profile_learning VALUES (?,?) ON CONFLICT(sessionId) DO UPDATE SET throughSequence=max(throughSequence,excluded.throughSequence)',
          ).run(sessionId, through);
          if (facts.characters.length || facts.relationships.length || facts.glossary.length)
            db.prepare('UPDATE profile_ai SET initialized=1 WHERE profileId=?').run(profileId);
        } else {
          const empty =
            !facts.characters.length && !facts.relationships.length && !facts.glossary.length;
          db.prepare('INSERT OR REPLACE INTO profile_ai VALUES (?,?)').run(
            profileId,
            empty ? 2 : 1,
          );
        }
      })();
    },
    /** Duyệt đề xuất theo giá trị gốc, không ghi đè sửa tay hoặc dữ kiện mới hơn. */
    resolveProfileProposal(id: string, action: 'accept' | 'reject'): void {
      db.transaction(() => {
        const proposal = profileProposals().find((item) => item.id === id);
        if (!proposal) throw new Error('INVALID_INPUT');
        if (action === 'accept') {
          const profile = profiles().find((item) => item.id === proposal.profileId);
          if (!profile) throw new Error('INVALID_INPUT');
          const value = acceptProfileProposal(profile, proposal);
          db.prepare('UPDATE profiles SET value=? WHERE id=?').run(
            JSON.stringify({ ...value, revision: profile.revision + 1 }),
            profile.id,
          );
        }
        db.prepare('UPDATE profile_proposals SET value=? WHERE id=?').run(
          JSON.stringify({ ...proposal, status: action === 'accept' ? 'accepted' : 'rejected' }),
          id,
        );
      })();
    },
    /** Đọc cấu hình và ghép mặc định khi chưa có dữ liệu. */
    settings(): AppSettings {
      return settingsSchema.parse({
        ...DEFAULT_SETTINGS,
        ...JSON.parse(readValue('preferences') ?? '{}'),
      });
    },
    /** Lưu cấu hình công khai đã kiểm tra. */
    saveSettings(settings: AppSettings): void {
      writeValue('preferences', JSON.stringify(settingsSchema.parse(settings)));
    },
    /** Đọc vùng dịch của hồ sơ; dữ liệu cũ hoặc hỏng dùng vùng mặc định. */
    profileRegion(profileId: string): CaptureRegion | undefined {
      const value = readValue(PROFILE_REGION_PREFIX + profileId);
      if (!value) return undefined;
      try {
        const result = regionSchema.safeParse(JSON.parse(value));
        return result.success ? result.data : undefined;
      } catch {
        return undefined;
      }
    },
    /** Lưu vùng dịch đã kiểm tra cho một hồ sơ còn tồn tại. */
    saveProfileRegion(profileId: string, region: CaptureRegion): void {
      if (!profiles().some((profile) => profile.id === profileId)) throw new Error('INVALID_INPUT');
      writeValue(PROFILE_REGION_PREFIX + profileId, JSON.stringify(regionSchema.parse(region)));
    },
    /** Lưu cả hồ sơ nguyên tử; quan hệ/thuật ngữ là phần của document có phiên bản. */
    saveProfile(input: GameProfile): void {
      const old = profiles().find((p) => p.id === input.id);
      if (old && old.revision !== input.revision) throw new Error('PROFILE_CHANGED');
      const value = profileSchema.parse({
        ...input,
        ...(input.id !== 'general' && input.aiEnabled === undefined ? { aiEnabled: true } : {}),
        revision: (old?.revision ?? -1) + 1,
      });
      db.prepare(
        'INSERT INTO profiles VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
      ).run(value.id, JSON.stringify(value));
    },
    /** Xóa hồ sơ cùng phiên liên quan. */
    deleteProfile(id: string): void {
      db.prepare('DELETE FROM profiles WHERE id=?').run(id);
      db.prepare('DELETE FROM settings WHERE id=?').run(PROFILE_REGION_PREFIX + id);
    },
    /** Tạo phiên độc lập, chưa bật capture. */
    createSession(profileId: string): StoredSession {
      const value: StoredSession = {
        id: randomUUID(),
        profileId,
        summary: '',
        summarizedThrough: 0,
        createdAt: Date.now(),
      };
      saveSession(value);
      return value;
    },
    /** Upsert hội thoại mà không thay thứ tự của các đoạn khác. */
    saveDialogue(value: Dialogue): void {
      db.prepare(
        'INSERT INTO dialogues VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
      ).run(
        value.id,
        value.sessionId,
        value.sequence,
        JSON.stringify({
          ...value,
          speaker: storedPerson(value.speaker),
          listener: storedPerson(value.listener),
        }),
      );
    },
    /** Đọc cache còn hạn; schema được kiểm tra lại trước sử dụng. */
    cache(id: string): TranslationResult | null {
      const row = db
        .prepare('SELECT value FROM translation_cache WHERE id=? AND createdAt>?')
        .get(id, Date.now() - CACHE_TTL_MS) as { value: string } | undefined;
      return row ? translationCacheSchema.parse(JSON.parse(row.value)) : null;
    },
    /** Ghi cache và dọn mục hết hạn/vượt dung lượng trong transaction. */
    putCache(id: string, result: TranslationResult): void {
      db.transaction(() => {
        db.prepare('INSERT OR REPLACE INTO translation_cache VALUES (?,?,?)').run(
          id,
          JSON.stringify(translationCacheSchema.parse(result)),
          Date.now(),
        );
        db.prepare('DELETE FROM translation_cache WHERE createdAt<=?').run(
          Date.now() - CACHE_TTL_MS,
        );
        db.prepare(
          'DELETE FROM translation_cache WHERE id IN (SELECT id FROM translation_cache ORDER BY createdAt DESC LIMIT -1 OFFSET ?)',
        ).run(CACHE_LIMIT);
      })();
    },
    /** Đóng kết nối sau khi đã dừng mọi tác vụ. */
    close(): void {
      db.close();
    },
  };
}
/** API lưu trữ được suy ra từ module, không thêm tầng repository chuyển tiếp. */
export type AppDatabase = ReturnType<typeof openDatabase>;
