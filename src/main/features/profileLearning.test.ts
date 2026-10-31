import { describe, expect, it } from 'vitest';
import { openDatabase } from '../database';
import { DEFAULT_PROFILE } from '../../shared/defaults';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const facts = {
  characters: [],
  relationships: [],
  glossary: [],
  evidence: 'Hội thoại đã dịch',
};

/** Tạo các câu khác nhau để dữ kiện thử có đủ bằng chứng trong cùng hồ sơ. */
function seedEvidence(
  db: ReturnType<typeof openDatabase>,
  sessionId = db.createSession('game').id,
): void {
  for (let i = 1; i <= 4; i++)
    db.saveDialogue({
      id: `evidence-${sessionId}-${i}`,
      sessionId,
      sequence: i,
      text: `Father Dad Gate Road Extra số ${i}`,
      translation: 'Bản dịch',
      speaker: 'unknown',
      listener: 'unknown',
      status: 'translated',
      createdAt: i,
      ocrMs: 0,
      apiMs: 0,
    });
}

describe('Bổ sung hồ sơ nguyên tử', () => {
  it('ẩn và chặn chấp nhận đề xuất quy tắc AI từ phiên bản cũ', () => {
    const folder = mkdtempSync(join(tmpdir(), 'legacy-instructions-'));
    const file = join(folder, 'data.sqlite');
    let db = openDatabase(file);
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', instructions: 'Người dùng tự nhập' });
      db.close();
      const legacy = new Database(file);
      try {
        legacy.prepare('INSERT INTO profile_proposals VALUES (?,?,?)').run(
          'old-rule',
          'game',
          JSON.stringify({
            id: 'old-rule',
            profileId: 'game',
            field: 'instructions',
            key: '',
            before: JSON.stringify('Người dùng tự nhập'),
            after: JSON.stringify('AI đề nghị'),
            evidence: 'Đề xuất cũ',
            status: 'pending',
          }),
        );
      } finally {
        legacy.close();
      }
      db = openDatabase(file);
      expect(db.profileProposals('game')).toEqual([]);
      expect(() => db.resolveProfileProposal('old-rule', 'accept')).toThrow('INVALID_INPUT');
      expect(db.profiles().find((p) => p.id === 'game')?.instructions).toBe('Người dùng tự nhập');
      const profile = db.profiles().find((p) => p.id === 'game')!;
      db.saveProfile({ ...profile, instructions: 'Người dùng sửa lại' });
      expect(db.profiles().find((p) => p.id === 'game')?.instructions).toBe('Người dùng sửa lại');
    } finally {
      db.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it.each(['', 'Quy tắc do người dùng nhập'])(
    'AI không điền hoặc đề xuất quy tắc ưu tiên khi giá trị hiện tại là %s',
    (instructions) => {
      const db = openDatabase(':memory:');
      try {
        db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', instructions });
        seedEvidence(db);
        const response = {
          ...facts,
          instructions: 'Quy tắc do AI tự tạo',
          glossary: [{ source: 'Gate', target: 'Cổng' }],
        };
        db.applyProfileEnrichment('game', 0, response);
        expect(db.profiles().find((p) => p.id === 'game')?.instructions).toBe(instructions);
        expect(db.profiles().find((p) => p.id === 'game')?.glossary).toEqual(response.glossary);
        expect(db.profileProposals('game')).toHaveLength(0);
      } finally {
        db.close();
      }
    },
  );
  it('ghép quan hệ theo biệt danh nhưng giữ chiều ngược độc lập', () => {
    const db = openDatabase(':memory:');
    try {
      db.saveProfile({
        ...DEFAULT_PROFILE,
        id: 'game',
        characters: [
          { id: 'father', name: 'Father', aliases: 'Dad' },
          { id: 'son', name: 'Son', aliases: 'Boy' },
        ],
        relationships: [{ speaker: 'Dad', listener: 'Boy', self: 'ta', address: 'con' }],
      });
      db.applyProfileEnrichment('game', 0, {
        ...facts,
        relationships: [
          { speaker: 'Father', listener: 'Son', self: 'ta', address: 'con' },
          { speaker: 'Son', listener: 'Father', self: 'con', address: 'cha' },
        ],
      });
      expect(db.profiles().find((p) => p.id === 'game')?.relationships).toHaveLength(2);
      expect(db.profileProposals('game')).toHaveLength(0);
    } finally {
      db.close();
    }
  });
  it('migration v1 giữ lịch sử, bật AI cho game cũ và giữ quyết định/mốc sau mở lại', () => {
    const folder = mkdtempSync(join(tmpdir(), 'profile-migration-'));
    const file = join(folder, 'legacy.sqlite');
    const legacy = new Database(file);
    legacy.exec(`CREATE TABLE settings (id TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE profiles (id TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE sessions (id TEXT PRIMARY KEY,profileId TEXT NOT NULL REFERENCES profiles(id),value TEXT NOT NULL);
      CREATE TABLE dialogues (id TEXT PRIMARY KEY,sessionId TEXT NOT NULL REFERENCES sessions(id),sequence INTEGER,value TEXT NOT NULL);
      CREATE TABLE translation_cache (id TEXT PRIMARY KEY,value TEXT NOT NULL,createdAt INTEGER);
      PRAGMA user_version=1;`);
    legacy.prepare('INSERT INTO profiles VALUES (?,?)').run(
      'game',
      JSON.stringify({
        ...DEFAULT_PROFILE,
        id: 'game',
        instructions: 'Cũ',
        glossary: [{ source: 'Gate', target: 'Cũ' }],
      }),
    );
    legacy.close();
    let db = openDatabase(file);
    try {
      expect(db.profiles().find((p) => p.id === 'game')?.aiEnabled).toBe(true);
      expect(db.profiles().find((p) => p.id === 'general')?.aiEnabled ?? false).toBe(false);
      const session = db.createSession('game');
      seedEvidence(db, session.id);
      db.applyProfileEnrichment(
        'game',
        0,
        { ...facts, glossary: [{ source: 'Gate', target: 'Mới' }] },
        session.id,
        20,
      );
      const proposal = db.profileProposals('game')[0];
      db.resolveProfileProposal(proposal.id, 'reject');
      db.close();
      db = openDatabase(file);
      expect(db.profileLearningThrough(session.id)).toBe(20);
      expect(db.sessions()[0].id).toBe(session.id);
      expect(db.profiles().find((p) => p.id === 'game')?.instructions).toBe('Cũ');
      db.applyProfileEnrichment('game', 0, {
        ...facts,
        glossary: [{ source: 'Gate', target: 'Mới' }],
      });
      expect(db.profileProposals('game')).toHaveLength(0);
    } finally {
      db.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it('chỉ điền phần thiếu, giữ chỉ dẫn cũ và lưu mâu thuẫn để duyệt', () => {
    const db = openDatabase(':memory:');
    try {
      db.saveProfile({
        ...DEFAULT_PROFILE,
        id: 'game',
        name: 'Game',
        instructions: 'Giữ tên riêng',
        glossary: [{ source: 'Gate', target: 'Cửa' }],
      });
      const profile = db.profiles().find((p) => p.id === 'game')!;
      seedEvidence(db);
      db.applyProfileEnrichment(profile.id, profile.revision, {
        ...facts,
        characters: [{ name: 'Father', aliases: 'Dad' }],
        glossary: [
          { source: 'Gate', target: 'Cổng' },
          { source: 'Road', target: 'Con đường' },
        ],
      });
      const saved = db.profiles().find((p) => p.id === 'game')!;
      expect(saved.instructions).toBe('Giữ tên riêng');
      expect(saved.characters[0].name).toBe('Father');
      expect(saved.glossary).toEqual([
        { source: 'Gate', target: 'Cửa' },
        { source: 'Road', target: 'Con đường' },
      ]);
      expect(db.profileProposals('game')).toHaveLength(1);
      const proposal = db.profileProposals('game')[0];
      db.resolveProfileProposal(proposal.id, 'reject');
      db.applyProfileEnrichment('game', saved.revision, {
        ...facts,
        glossary: [{ source: 'Gate', target: 'Cổng' }],
      });
      expect(db.profileProposals('game')).toHaveLength(0);
    } finally {
      db.close();
    }
  });
  it('nhận diện biệt danh và không tạo nhân vật trùng', () => {
    const db = openDatabase(':memory:');
    try {
      db.saveProfile({
        ...DEFAULT_PROFILE,
        id: 'game',
        characters: [{ id: 'father', name: 'Father', aliases: 'Dad' }],
      });
      db.applyProfileEnrichment('game', 0, {
        ...facts,
        characters: [{ name: 'Dad', aliases: '' }],
      });
      expect(db.profiles().find((p) => p.id === 'game')?.characters).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it('chấp nhận đề xuất phải kiểm tra dữ liệu gốc chưa đổi', () => {
    const db = openDatabase(':memory:');
    try {
      db.saveProfile({
        ...DEFAULT_PROFILE,
        id: 'game',
        glossary: [{ source: 'Gate', target: 'Cũ' }],
      });
      seedEvidence(db);
      db.applyProfileEnrichment('game', 0, {
        ...facts,
        glossary: [{ source: 'Gate', target: 'Đề nghị' }],
      });
      const proposal = db.profileProposals('game')[0];
      const profile = db.profiles().find((p) => p.id === 'game')!;
      db.saveProfile({ ...profile, glossary: [{ source: 'Gate', target: 'Đã sửa tay' }] });
      expect(() => db.resolveProfileProposal(proposal.id, 'accept')).toThrow('PROFILE_CHANGED');
      expect(db.profiles().find((p) => p.id === 'game')?.glossary[0].target).toBe('Đã sửa tay');
    } finally {
      db.close();
    }
  });
  it('không lưu một phần hồ sơ hoặc mốc khi vượt giới hạn', () => {
    const db = openDatabase(':memory:');
    try {
      db.saveProfile({
        ...DEFAULT_PROFILE,
        id: 'game',
        characters: Array.from({ length: 100 }, (_, i) => ({
          id: String(i),
          name: `Name ${i}`,
          aliases: '',
        })),
      });
      const session = db.createSession('game');
      seedEvidence(db, session.id);
      expect(() =>
        db.applyProfileEnrichment(
          'game',
          0,
          { ...facts, characters: [{ name: 'Extra', aliases: '' }] },
          session.id,
          20,
        ),
      ).toThrow();
      expect(db.profileLearningThrough(session.id)).toBe(0);
      expect(db.profiles().find((p) => p.id === 'game')?.revision).toBe(0);
    } finally {
      db.close();
    }
  });
});
