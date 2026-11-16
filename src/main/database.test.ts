import { describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../shared/defaults';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { settingsSchema, profileSchema } from '../shared/types';
import Database from 'better-sqlite3';

describe('Lưu dữ liệu và migration', () => {
  it('hồ sơ cũ mặc định tên đầu dòng và mỗi game lưu kiểu tên độc lập', () => {
    const legacy = { ...DEFAULT_PROFILE };
    Reflect.deleteProperty(legacy, 'speakerDisplay');
    expect(profileSchema.parse(legacy).speakerDisplay).toBe('inline');
    expect(profileSchema.safeParse({ ...legacy, speakerDisplay: 'invalid' }).success).toBe(false);
    const db = openDatabase(':memory:');
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'first', speakerDisplay: 'separateLine' });
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'second' });
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'third', speakerDisplay: 'none' });
      expect(db.profiles().find((p) => p.id === 'first')?.speakerDisplay).toBe('separateLine');
      expect(db.profiles().find((p) => p.id === 'second')?.speakerDisplay).toBe('inline');
      expect(db.profiles().find((p) => p.id === 'third')?.speakerDisplay).toBe('none');
    } finally {
      db.close();
    }
  });
  it('migration v3 xóa thuật ngữ và đề xuất cũ, giữ dữ liệu còn lại và chỉ chạy một lần', () => {
    const folder = mkdtempSync(join(tmpdir(), 'remove-glossary-'));
    const file = join(folder, 'data.sqlite');
    let db = openDatabase(file);
    try {
      db.saveProfile({
        ...DEFAULT_PROFILE,
        id: 'game',
        name: 'Game',
        instructions: 'Giữ tên',
        characters: [{ id: 'a', name: 'Alice', aliases: 'Ally' }],
      });
      const session = db.createSession('game');
      db.saveDialogue({
        id: 'd',
        sessionId: session.id,
        sequence: 1,
        text: 'Hello.',
        translation: 'Chào.',
        speaker: 'Alice',
        listener: 'unknown',
        status: 'translated',
        createdAt: 0,
        ocrMs: 0,
        apiMs: 0,
      });
      db.saveSettings({ ...DEFAULT_SETTINGS, locale: 'en' });
      db.close();
      const legacy = new Database(file);
      try {
        legacy.pragma('user_version = 2');
        legacy
          .prepare(
            "UPDATE profiles SET value=json_set(value, '$.glossary', json(?)) WHERE id='game'",
          )
          .run(JSON.stringify([{ source: 'Gate', target: 'Cổng' }]));
        for (const field of ['glossary', 'relationships'])
          legacy.prepare('INSERT INTO profile_proposals VALUES (?,?,?)').run(
            field,
            'game',
            JSON.stringify({
              id: field,
              profileId: 'game',
              field,
              key: '',
              before: '[]',
              after: '[]',
              evidence: 'Cũ',
              status: 'pending',
            }),
          );
        legacy.prepare('INSERT INTO translation_cache VALUES (?,?,?)').run('old-cache', '{}', 0);
      } finally {
        legacy.close();
      }
      db = openDatabase(file);
      expect(db.profiles()[0]).not.toHaveProperty('glossary');
      expect(db.profiles()[0]).toMatchObject({
        name: 'Game',
        instructions: 'Giữ tên',
        revision: 1,
        characters: [{ name: 'Alice', aliases: 'Ally' }],
      });
      expect(db.profileProposals().map((row) => row.field)).toEqual(['relationships']);
      expect(db.dialogues(session.id)).toHaveLength(1);
      expect(db.settings().locale).toBe('en');
      db.migrate();
      expect(db.profiles()[0].revision).toBe(1);
      const raw = new Database(file, { readonly: true });
      try {
        expect(raw.pragma('user_version', { simple: true })).toBe(3);
        expect(
          raw
            .prepare("SELECT json_type(value,'$.glossary') AS field FROM profiles WHERE id='game'")
            .get(),
        ).toEqual({ field: null });
        expect(
          raw.prepare("SELECT id FROM profile_proposals WHERE id='glossary'").get(),
        ).toBeUndefined();
        expect(raw.prepare('SELECT count(*) AS count FROM translation_cache').get()).toEqual({
          count: 0,
        });
      } finally {
        raw.close();
      }
    } finally {
      db.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it.each(['onnx', 'unsupported'])('từ chối provider không còn hỗ trợ: %s', (provider) => {
    const db = openDatabase(':memory:');
    try {
      const preferences = JSON.stringify({
        ...DEFAULT_SETTINGS,
        provider,
      });
      db.writeValue('preferences', preferences);
      expect(() => db.settings()).toThrow();
      expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, provider }).success).toBe(false);
      expect(db.readValue('preferences')).toBe(preferences);
    } finally {
      db.close();
    }
  });
  it('settings cũ mặc định tắt tóm tắt, lưu được bật/tắt và từ chối giá trị sai kiểu', () => {
    const db = openDatabase(':memory:');
    try {
      db.writeValue('preferences', JSON.stringify({ model: 'old' }));
      expect(db.settings().summaryEnabled).toBe(false);
      for (const summaryEnabled of [true, false]) {
        db.saveSettings({ ...db.settings(), summaryEnabled });
        expect(db.settings().summaryEnabled).toBe(summaryEnabled);
      }
      expect(
        settingsSchema.safeParse({ ...DEFAULT_SETTINGS, summaryEnabled: 'true' }).success,
      ).toBe(false);
    } finally {
      db.close();
    }
  });
  it('lưu người chưa xác định dưới dạng null trong SQLite', () => {
    const folder = mkdtempSync(join(tmpdir(), 'dialogue-null-'));
    const file = join(folder, 'data.sqlite');
    const db = openDatabase(file);
    try {
      db.saveProfile(DEFAULT_PROFILE);
      const session = db.createSession('general');
      db.saveDialogue({
        id: 'd',
        sessionId: session.id,
        sequence: 1,
        text: 'Hello',
        translation: 'Chào',
        speaker: 'unknown',
        listener: 'Alice',
        status: 'translated',
        createdAt: 0,
        ocrMs: 0,
        apiMs: 0,
      });
      const raw = new Database(file, { readonly: true });
      try {
        expect(
          raw
            .prepare(
              "SELECT json_type(value, '$.speaker') AS speaker, json_extract(value, '$.listener') AS listener FROM dialogues WHERE id='d'",
            )
            .get(),
        ).toEqual({ speaker: 'null', listener: 'Alice' });
      } finally {
        raw.close();
      }
    } finally {
      db.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it('xóa dữ kiện và đề xuất hồ sơ, giữ quy tắc, lịch sử và bỏ qua hội thoại cũ khi học tiếp', () => {
    const db = openDatabase(':memory:');
    try {
      db.saveProfile({
        ...DEFAULT_PROFILE,
        id: 'game',
        name: 'Game',
        instructions: 'Giữ tên',
        characters: [{ id: 'c', name: 'Sai', aliases: '' }],
        relationships: [{ speaker: 'Sai', listener: 'Khác', self: 'ta', address: 'ngươi' }],
      });
      const original = db.profiles().find((p) => p.id === 'game')!;
      const session = db.createSession('game');
      for (let i = 1; i <= 4; i++)
        db.saveDialogue({
          id: `d-${i}`,
          sessionId: session.id,
          sequence: i,
          text: `Hello Gate ${i}`,
          translation: 'Chào',
          speaker: 'Sai',
          listener: 'Khác',
          status: 'translated',
          createdAt: 0,
          ocrMs: 1,
          apiMs: 1,
        });
      db.applyProfileEnrichment('game', original.revision, {
        characters: [],
        relationships: [{ speaker: 'Sai', listener: 'Khác', self: 'tôi', address: 'bạn' }],
        evidence: 'test',
      });
      expect(db.profileProposals('game')).toHaveLength(1);
      expect(() => db.clearProfile('game', original.revision - 1)).toThrow('PROFILE_CHANGED');
      expect(db.profileProposals('game')).toHaveLength(1);
      db.clearProfile('game', original.revision);
      expect(db.profiles().find((p) => p.id === 'game')).toMatchObject({
        name: 'Game',
        instructions: 'Giữ tên',
        characters: [],
        relationships: [],
        revision: original.revision + 1,
      });
      expect(db.profileProposals('game')).toHaveLength(0);
      expect(db.dialogues(session.id)).toHaveLength(4);
      expect(db.profileLearningThrough(session.id)).toBe(4);
      expect(db.profileInitialized('game')).toBe(true);
      expect(db.profileWasCleared('game')).toBe(true);
    } finally {
      db.close();
    }
  });
  it('cấu hình overlay toàn màn hình có mặc định và kiểm tra cỡ chữ', () => {
    const db = openDatabase(':memory:');
    try {
      db.writeValue('preferences', JSON.stringify({ locale: 'en' }));
      expect(db.settings()).toMatchObject({
        overlayFullscreen: false,
        overlayFullscreenFontSize: 28,
      });
      db.saveSettings({ ...db.settings(), overlayFullscreen: true, overlayFullscreenFontSize: 48 });
      expect(db.settings()).toMatchObject({
        overlayFullscreen: true,
        overlayFullscreenFontSize: 48,
      });
      for (const overlayFullscreenFontSize of [15, 65, 1.5, NaN])
        expect(
          settingsSchema.safeParse({ ...DEFAULT_SETTINGS, overlayFullscreenFontSize }).success,
        ).toBe(false);
    } finally {
      db.close();
    }
  });
  it('thời gian overlay mặc định 5 giây, lưu được và chặn giá trị ngoài 1-60 giây', () => {
    const db = openDatabase(':memory:');
    try {
      db.writeValue('preferences', JSON.stringify({ locale: 'en' }));
      expect(db.settings().overlayDurationSeconds).toBe(5);
      db.saveSettings({ ...db.settings(), overlayDurationSeconds: 12 });
      expect(db.settings().overlayDurationSeconds).toBe(12);
      for (const overlayDurationSeconds of [0, -1, 61, 1.5, NaN])
        expect(
          settingsSchema.safeParse({ ...DEFAULT_SETTINGS, overlayDurationSeconds }).success,
        ).toBe(false);
    } finally {
      db.close();
    }
  });
  it('cache giữ model đã dịch nhưng loại bỏ token và chi phí cũ', () => {
    const db = openDatabase(':memory:');
    try {
      db.putCache('model-cache', {
        translation: 'Chào.',
        speaker: 'unknown',
        listener: 'unknown',
        modelId: 'vendor/actual-model:free',
        usage: { inputTokens: 100, outputTokens: 20 },
        costUsd: 0.0001,
      });
      expect(db.cache('model-cache')).toEqual({
        translation: 'Chào.',
        speaker: 'unknown',
        listener: 'unknown',
        modelId: 'vendor/actual-model:free',
      });
      db.putCache('legacy-cache', { translation: 'Cũ.', speaker: 'unknown', listener: 'unknown' });
      expect(db.cache('legacy-cache')?.modelId).toBeUndefined();
    } finally {
      db.close();
    }
  });
  it('cấu hình cũ nhận ngưỡng 80, lưu được 0/100 và từ chối ngoài phạm vi', () => {
    const db = openDatabase(':memory:');
    try {
      db.writeValue('preferences', JSON.stringify({ locale: 'en' }));
      expect(db.settings().duplicateThreshold).toBe(80);
      for (const duplicateThreshold of [0, 100]) {
        db.saveSettings({ ...db.settings(), duplicateThreshold });
        expect(db.settings().duplicateThreshold).toBe(duplicateThreshold);
      }
      for (const duplicateThreshold of [-1, 101, 80.5, NaN])
        expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, duplicateThreshold }).success).toBe(
          false,
        );
    } finally {
      db.close();
    }
  });
  it('migration có thể chạy lại, settings không chứa API key', () => {
    const db = openDatabase(':memory:');
    db.saveSettings({ ...DEFAULT_SETTINGS, locale: 'en' });
    db.migrate();
    expect(db.settings().locale).toBe('en');
    expect(db.settings()).not.toHaveProperty('apiKey');
    expect(db.profiles()).toEqual([]);
    db.close();
  });
  it('hai quan hệ ngược chiều được giữ độc lập trong hồ sơ', () => {
    const db = openDatabase(':memory:');
    db.saveProfile({
      ...DEFAULT_PROFILE,
      relationships: [
        { speaker: 'Father', listener: 'Son', self: 'ta', address: 'con' },
        { speaker: 'Son', listener: 'Father', self: 'con', address: 'cha' },
      ],
    });
    expect(db.profiles()[0].relationships).toHaveLength(2);
    expect(db.profiles()[0].revision).toBe(0);
    db.close();
  });
  it('giữ phiên khi sửa hồ sơ và giữ dữ liệu sau khi mở lại file', () => {
    const folder = mkdtempSync(join(tmpdir(), 'translate-game-db-'));
    const file = join(folder, 'data.sqlite');
    const db = openDatabase(file);
    db.saveProfile(DEFAULT_PROFILE);
    const session = db.createSession('general');
    db.saveProfile({ ...DEFAULT_PROFILE, instructions: 'Giữ tên nhân vật' });
    db.saveSettings({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      locale: 'en',
      duplicateThreshold: 95,
      summaryEnabled: true,
    });
    db.saveDialogue({
      id: 'usage-test',
      sessionId: session.id,
      sequence: 1,
      text: 'Hello.',
      translation: 'Chào.',
      speaker: 'unknown',
      listener: 'unknown',
      status: 'translated',
      createdAt: 0,
      ocrMs: 1,
      apiMs: 2,
      usage: { inputTokens: 100, outputTokens: 20 },
      costUsd: 0.00001234,
      modelId: 'vendor/actual-model:free',
    });
    expect(db.sessions()).toHaveLength(1);
    db.close();
    const reopened = openDatabase(file);
    try {
      expect(reopened.sessions()[0].id).toBe(session.id);
      expect(reopened.settings().theme).toBe('dark');
      expect(reopened.settings().locale).toBe('en');
      expect(reopened.settings().duplicateThreshold).toBe(95);
      expect(reopened.settings().summaryEnabled).toBe(true);
      expect(reopened.dialogues(session.id)[0].costUsd).toBe(0.00001234);
      expect(reopened.dialogues(session.id)[0].modelId).toBe('vendor/actual-model:free');
      expect(reopened.dialogues(session.id)[0].usage).toEqual({
        inputTokens: 100,
        outputTokens: 20,
      });
    } finally {
      reopened.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
