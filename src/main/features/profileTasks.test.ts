import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../database';
import { OpenRouter } from './openRouter';
import { SessionController } from './session';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../../shared/defaults';
import type { ProfileEnrichment } from '../../shared/types';

const emptyFacts: ProfileEnrichment = {
  characters: [],
  relationships: [],
  glossary: [],
  evidence: 'Chưa có dữ kiện chắc chắn',
};

describe('Vòng đời tác vụ hồ sơ', () => {
  it('lọc response HTTP giả lập theo hội thoại trước khi lưu hồ sơ', async () => {
    const db = openDatabase(':memory:');
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    characters: [
                      { name: 'Alice', aliases: 'Alice, Ally' },
                      { name: 'Bob', aliases: '' },
                    ],
                    relationships: [
                      {
                        speaker: 'Alice',
                        listener: 'Bob',
                        self: 'tôi / ta',
                        address: 'em hoặc con',
                      },
                    ],
                    glossary: [
                      { source: 'Gate', target: 'Cổng' },
                      { source: 'Alice', target: 'Alice' },
                    ],
                    evidence: 'Hội thoại',
                  }),
                },
              },
            ],
          }),
        ),
    );
    const api = new OpenRouter(() => 'key', transport);
    const app = new SessionController(db, api, () => undefined);
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', name: 'Game' });
      const session = db.createSession('game');
      for (let i = 1; i <= 4; i++)
        db.saveDialogue({
          id: `evidence-${i}`,
          sessionId: session.id,
          sequence: i,
          text: `Alice sees Gate ${i}`,
          translation: 'Dịch',
          speaker: 'Alice',
          listener: 'unknown',
          status: 'translated',
          createdAt: i,
          ocrMs: 0,
          apiMs: 0,
        });
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'model' });
      app.environment(false, true);
      await vi.waitFor(() => expect(db.profileInitialized('game')).toBe(true));
      const profile = db.profiles().find((p) => p.id === 'game')!;
      expect(profile.characters).toEqual([
        expect.objectContaining({ name: 'Alice', aliases: 'Ally' }),
      ]);
      expect(profile.glossary).toEqual([{ source: 'Gate', target: 'Cổng' }]);
      expect(profile.relationships).toEqual([
        { speaker: 'Alice', listener: 'Bob', self: 'tôi', address: 'em' },
      ]);
      expect(transport).toHaveBeenCalledTimes(1);
    } finally {
      app.stop();
      db.close();
    }
  });
  it('xóa hồ sơ hủy tác vụ và không lưu response AI trả muộn', async () => {
    const db = openDatabase(':memory:');
    const api = new OpenRouter(() => 'key');
    let finish: (facts: ProfileEnrichment) => void = () => undefined;
    const enrich = vi.spyOn(api, 'enrichProfile').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const app = new SessionController(db, api, () => undefined);
    try {
      db.saveProfile({
        ...DEFAULT_PROFILE,
        id: 'game',
        name: 'Game',
        characters: [{ id: 'c', name: 'Sai', aliases: '' }],
      });
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'model' });
      app.environment(false, true);
      const profile = db.profiles().find((p) => p.id === 'game')!;
      db.clearProfile('game', profile.revision);
      app.profileCleared('game');
      expect(enrich.mock.calls[0][2].aborted).toBe(true);
      expect(app.snapshot().profileTasks?.[0].status).toBe('cleared');
      finish({ ...emptyFacts, characters: [{ name: 'Sai', aliases: '' }] });
      await new Promise((resolve) => setImmediate(resolve));
      expect(db.profiles().find((p) => p.id === 'game')?.characters).toEqual([]);
      expect(enrich).toHaveBeenCalledTimes(1);
    } finally {
      app.stop();
      db.close();
    }
  });
  it('lưu cách xưng hô AI tạo ngay trong lần khởi tạo', async () => {
    const db = openDatabase(':memory:');
    const api = new OpenRouter(() => 'key');
    vi.spyOn(api, 'enrichProfile').mockResolvedValue({
      ...emptyFacts,
      relationships: [
        { speaker: 'Father', listener: 'Son', self: 'cha', address: 'con' },
        { speaker: 'Son', listener: 'Father', self: 'con', address: 'cha' },
      ],
    });
    const app = new SessionController(db, api, () => undefined);
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', name: 'Game' });
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'model' });
      app.environment(false, true);
      await vi.waitFor(() =>
        expect(db.profiles().find((p) => p.id === 'game')?.relationships).toHaveLength(2),
      );
    } finally {
      app.stop();
      db.close();
    }
  });
  it('không hủy và gửi lại khi thử lại tác vụ đang chạy', async () => {
    const db = openDatabase(':memory:');
    const api = new OpenRouter(() => 'key');
    const enrich = vi
      .spyOn(api, 'enrichProfile')
      .mockImplementation(() => new Promise(() => undefined));
    const app = new SessionController(db, api, () => undefined);
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', name: 'Game' });
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'model' });
      app.environment(false, true);
      app.retryProfile('game');
      expect(enrich).toHaveBeenCalledTimes(1);
      expect(enrich.mock.calls[0][2].aborted).toBe(false);
    } finally {
      app.stop();
      db.close();
    }
  });
  it('xếp thử lại vào hàng chờ khi hồ sơ khác đang chạy', async () => {
    const db = openDatabase(':memory:');
    const api = new OpenRouter(() => 'key');
    let finish: (facts: ProfileEnrichment) => void = () => undefined;
    const enrich = vi
      .spyOn(api, 'enrichProfile')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(emptyFacts);
    const app = new SessionController(db, api, () => undefined);
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'one', name: 'One' });
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'two', name: 'Two' });
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'model' });
      app.environment(false, true);
      app.retryProfile('two');
      app.retryProfile('two');
      expect(app.snapshot().profileTasks?.find((t) => t.profileId === 'two')?.status).toBe(
        'queued',
      );
      expect(enrich).toHaveBeenCalledTimes(1);
      finish(emptyFacts);
      await vi.waitFor(() => expect(db.profileInitialized('two')).toBe(true));
      expect(enrich).toHaveBeenCalledTimes(2);
    } finally {
      app.stop();
      db.close();
    }
  });
  it('khởi tạo rỗng báo không có dữ liệu nhưng vẫn học hội thoại', async () => {
    const db = openDatabase(':memory:');
    const api = new OpenRouter(() => 'key');
    const enrich = vi
      .spyOn(api, 'enrichProfile')
      .mockResolvedValueOnce(emptyFacts)
      .mockResolvedValueOnce({
        ...emptyFacts,
        relationships: [{ speaker: 'Dad', listener: 'Son', self: 'cha', address: 'con' }],
      });
    vi.spyOn(api, 'translate').mockResolvedValue({
      translation: 'Chào con.',
      speaker: 'Dad',
      listener: 'Son',
    });
    const app = new SessionController(db, api, () => undefined);
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', name: 'Unknown game' });
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'model', profileLearningInterval: 1 });
      app.environment(false, true);
      await vi.waitFor(() =>
        expect(app.snapshot().profileTasks?.find((t) => t.profileId === 'game')?.status).toBe(
          'no_data',
        ),
      );
      expect(db.profileInitialized('game')).toBe(true);
      const reopened = new SessionController(db, api, () => undefined);
      reopened.environment(false, false);
      expect(reopened.snapshot().profileTasks?.find((t) => t.profileId === 'game')?.status).toBe(
        'no_data',
      );
      app.openSession('game');
      app.ocr('Hello there', app.begin(), 0, true);
      await vi.waitFor(() =>
        expect(db.profiles().find((p) => p.id === 'game')?.relationships).toEqual([
          { speaker: 'Dad', listener: 'Son', self: 'cha', address: 'con' },
        ]),
      );
      expect(enrich).toHaveBeenCalledTimes(2);
    } finally {
      app.stop();
      db.close();
    }
  });
  it('thử lại khởi tạo sau kết quả rỗng và sau lỗi vẫn tiếp tục khởi tạo', async () => {
    const db = openDatabase(':memory:');
    const api = new OpenRouter(() => 'key');
    const enrich = vi
      .spyOn(api, 'enrichProfile')
      .mockResolvedValueOnce(emptyFacts)
      .mockRejectedValueOnce(new Error('NETWORK'))
      .mockResolvedValueOnce({ ...emptyFacts, characters: [{ name: 'Hero', aliases: '' }] });
    const app = new SessionController(db, api, () => undefined);
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', name: 'Game' });
      const session = db.createSession('game');
      for (let i = 1; i <= 4; i++)
        db.saveDialogue({
          id: `hero-${i}`,
          sessionId: session.id,
          sequence: i,
          text: `Hero speaks ${i}`,
          translation: 'Anh nói',
          speaker: 'Hero',
          listener: 'unknown',
          status: 'translated',
          createdAt: i,
          ocrMs: 0,
          apiMs: 0,
        });
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'model' });
      app.environment(false, true);
      await vi.waitFor(() => expect(app.snapshot().profileTasks?.[0].status).toBe('no_data'));
      app.retryProfile('game');
      await vi.waitFor(() => expect(app.snapshot().profileTasks?.[0].status).toBe('error'));
      app.retryProfile('game');
      await vi.waitFor(() => expect(app.snapshot().profileTasks?.[0].status).toBe('completed'));
      expect(enrich.mock.calls.map((call) => JSON.parse(call[1]).mode)).toEqual([
        'initialize',
        'initialize',
        'initialize',
      ]);
    } finally {
      app.stop();
      db.close();
    }
  });
  it('khởi tạo rồi học theo lô, không dừng dịch và không lặp lại lô đã xử lý', async () => {
    const db = openDatabase(':memory:');
    const api = new OpenRouter(() => 'key');
    const enrich = vi.spyOn(api, 'enrichProfile').mockResolvedValue(emptyFacts);
    vi.spyOn(api, 'translate').mockResolvedValue({
      translation: 'Chào.',
      speaker: 'unknown',
      listener: 'unknown',
    });
    const app = new SessionController(db, api, () => undefined);
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', name: 'Game' });
      app.updateSettings({
        ...DEFAULT_SETTINGS,
        model: 'translation',
        profileModel: 'profile',
        profileLearningInterval: 1,
      });
      app.environment(false, true);
      await vi.waitFor(() => expect(db.profileInitialized('game')).toBe(true));
      app.openSession('game');
      const generation = app.begin();
      app.ocr('Hello world', generation, 0, true);
      await vi.waitFor(() => expect(db.profileLearningThrough(app.snapshot().session!.id)).toBe(1));
      expect(enrich).toHaveBeenCalledTimes(2);
      expect(enrich.mock.calls[1][0]).toBe('profile');
      expect(JSON.parse(enrich.mock.calls[1][1]).mode).toBe('learn');
      expect(JSON.parse(enrich.mock.calls[1][1]).dialogues).toEqual([]);
      expect(app.snapshot().status).toBe('running');
      app.environment(false, true);
      expect(enrich).toHaveBeenCalledTimes(2);
    } finally {
      app.stop();
      db.close();
    }
  });
  it('mặc định khởi tạo hồ sơ không tìm web', async () => {
    const db = openDatabase(':memory:');
    const api = new OpenRouter(() => 'key');
    const enrich = vi.spyOn(api, 'enrichProfile').mockResolvedValue(emptyFacts);
    const app = new SessionController(db, api, () => undefined);
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'new-game', name: 'Game mới' });
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'model' });
      app.environment(false, true);
      await vi.waitFor(() => expect(db.profileInitialized('new-game')).toBe(true));
      expect(enrich).toHaveBeenCalledTimes(1);
    } finally {
      app.stop();
      db.close();
    }
  });
  it('thiếu cấu hình vẫn lưu được, lỗi chỉ thử lại khi người dùng yêu cầu', async () => {
    const db = openDatabase(':memory:');
    const api = new OpenRouter(() => 'key');
    const enrich = vi.spyOn(api, 'enrichProfile').mockRejectedValue(new Error('NETWORK'));
    const app = new SessionController(db, api, () => undefined);
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', name: 'Game' });
      app.profileChanged('game');
      expect(enrich).not.toHaveBeenCalled();
      expect(app.snapshot().profileTasks?.[0].status).toBe('waiting');
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'model' });
      app.environment(false, true);
      await vi.waitFor(() => expect(app.snapshot().profileTasks?.[0].status).toBe('error'));
      app.environment(false, true);
      expect(enrich).toHaveBeenCalledTimes(1);
      enrich.mockResolvedValue(emptyFacts);
      app.retryProfile('game');
      await vi.waitFor(() => expect(db.profileInitialized('game')).toBe(true));
      expect(enrich).toHaveBeenCalledTimes(2);
    } finally {
      app.stop();
      db.close();
    }
  });
  it('dừng hoặc tắt AI vô hiệu response muộn kể cả khi transport không tuân signal', async () => {
    const db = openDatabase(':memory:');
    const api = new OpenRouter(() => 'key');
    let finish: (facts: ProfileEnrichment) => void = () => undefined;
    const enrich = vi.spyOn(api, 'enrichProfile').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const app = new SessionController(db, api, () => undefined);
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', name: 'Game' });
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'model' });
      app.environment(false, true);
      expect(enrich).toHaveBeenCalledTimes(1);
      const profile = db.profiles().find((item) => item.id === 'game')!;
      db.saveProfile({ ...profile, aiEnabled: false });
      app.profileChanged('game');
      expect(enrich.mock.calls[0][2].aborted).toBe(true);
      finish({ ...emptyFacts, glossary: [{ source: 'Gate', target: 'Response muộn' }] });
      await new Promise((resolve) => setImmediate(resolve));
      expect(db.profiles().find((item) => item.id === 'game')?.instructions).toBe('');
      expect(db.profiles().find((item) => item.id === 'game')?.glossary).toEqual([]);
      expect(db.profileInitialized('game')).toBe(false);
    } finally {
      app.stop();
      db.close();
    }
  });
});
