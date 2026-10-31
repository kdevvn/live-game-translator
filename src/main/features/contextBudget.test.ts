import { describe, expect, it, vi } from 'vitest';
import { backgroundInputLimit, OpenRouter } from './openRouter';
import { SessionController } from './session';
import { openDatabase } from '../database';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, INPUT_TOKEN_LIMIT } from '../../shared/defaults';
import { settingsSchema } from '../../shared/types';
import { buildMessages } from './context';

describe('Ngân sách riêng của hồ sơ game', () => {
  it('tóm tắt và hồ sơ dùng trần cấu hình thay vì trần dịch 6000', () => {
    for (const purpose of ['summary', 'profile'] as const) {
      expect(backgroundInputLimit(undefined, purpose, 15000)).toBeGreaterThan(10000);
      expect(
        backgroundInputLimit(100000, purpose, 25000) - backgroundInputLimit(100000, purpose, 15000),
      ).toBe(10000);
      expect(backgroundInputLimit(8000, purpose, 25000)).toBeLessThan(
        backgroundInputLimit(100000, purpose, 25000),
      );
    }
    expect(INPUT_TOKEN_LIMIT).toBe(6000);
    expect(() =>
      buildMessages(DEFAULT_PROFILE, '', [], 'a'.repeat(6001), INPUT_TOKEN_LIMIT),
    ).toThrow('CONTEXT_LIMIT');
  });
  it('tính hướng dẫn định dạng vào ngân sách và prompt dùng cho cache', () => {
    const api = new OpenRouter(() => 'key');
    api.setModels([{ id: 'plain', supportsStructuredOutputs: false }]);
    const instruction = api.translationFormatInstruction('plain');
    const strict = buildMessages(DEFAULT_PROFILE, '', [], 'hello', 6000);
    const plain = buildMessages(DEFAULT_PROFILE, '', [], 'hello', 6000, instruction);
    expect(plain.some((message) => message.content === instruction)).toBe(true);
    expect(plain).not.toEqual(strict);
    expect(() =>
      buildMessages(DEFAULT_PROFILE, '', [], 'hello', 1000, instruction.repeat(10)),
    ).toThrow('CONTEXT_LIMIT');
  });
  it('settings cũ nhận 15000, lưu được mức mới và từ chối dữ liệu không hợp lệ', () => {
    const db = openDatabase(':memory:');
    try {
      db.writeValue('preferences', JSON.stringify({ model: 'old' }));
      expect(db.settings().profileInputTokenLimit).toBe(15000);
      db.saveSettings({ ...db.settings(), profileInputTokenLimit: 25000 });
      expect(db.settings().profileInputTokenLimit).toBe(25000);
      for (const profileInputTokenLimit of [0, -1, 1.5, NaN, 1000001])
        expect(
          settingsSchema.safeParse({ ...DEFAULT_SETTINGS, profileInputTokenLimit }).success,
        ).toBe(false);
    } finally {
      db.close();
    }
  });
  it('tăng ngân sách cho phép thử lại hồ sơ dài mà không dừng dịch', async () => {
    const db = openDatabase(':memory:');
    const api = new OpenRouter(() => 'key');
    const enrich = vi.spyOn(api, 'enrichProfile').mockResolvedValue({
      characters: [],
      relationships: [],
      glossary: [],
      evidence: 'Không có bổ sung',
    });
    const app = new SessionController(db, api, () => undefined);
    try {
      db.saveProfile({
        ...DEFAULT_PROFILE,
        id: 'long-game',
        instructions: 'a'.repeat(4000),
        characters: Array.from({ length: 8 }, (_, i) => ({
          id: String(i),
          name: `Name ${i}`,
          aliases: 'b'.repeat(500),
        })),
      });
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'model', profileInputTokenLimit: 3000 });
      db.saveProfile(DEFAULT_PROFILE);
      app.openSession('general');
      const generation = app.begin();
      app.ready(generation);
      app.environment(false, true);
      expect(app.snapshot().profileTasks?.[0].error).toBe('CONTEXT_LIMIT');
      expect(enrich).not.toHaveBeenCalled();
      app.updateSettings({ ...app.snapshot().settings, profileInputTokenLimit: 15000 });
      await vi.waitFor(() => expect(db.profileInitialized('long-game')).toBe(true));
      expect(enrich).toHaveBeenCalledTimes(1);
      expect(Buffer.byteLength(enrich.mock.calls[0][1], 'utf8')).toBeGreaterThan(6000);
      expect(app.snapshot().status).toBe('running');
      expect(app.snapshot().generation).toBe(generation);
    } finally {
      app.stop();
      db.close();
    }
  });
});
