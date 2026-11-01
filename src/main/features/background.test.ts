import { describe, expect, it, vi } from 'vitest';
import { OpenRouter } from './openRouter';
import { openDatabase } from '../database';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../../shared/defaults';
import { SessionController } from './session';
import type { ProfileEnrichment } from '../../shared/types';

describe('Model và transport tác vụ nền', () => {
  it.each(['lmStudio', 'ollama'] as const)(
    'giữ lịch sử ổn định và tóm tắt song song qua %s suốt 50 câu, không hủy hoặc gửi trùng',
    async (provider) => {
      const db = openDatabase(':memory:');
      db.saveProfile(DEFAULT_PROFILE);
      const api = new OpenRouter(() => '');
      let finishSummary: (text: string) => void = () => undefined;
      const summary = vi.spyOn(api, 'summarize').mockImplementation(
        () =>
          new Promise((resolve) => {
            finishSummary = resolve;
          }),
      );
      const translate = vi.spyOn(api, 'translate').mockResolvedValue({
        translation: 'Chào.',
        speaker: 'Alice',
        listener: 'Bob',
      });
      const app = new SessionController(db, api, () => undefined);
      try {
        app.updateSettings({
          ...DEFAULT_SETTINGS,
          provider,
          lmStudioModel: 'local',
          ollamaModel: 'local',
        });
        app.openSession('general');
        const generation = app.begin();
        app.ready(generation);
        for (let index = 1; index <= 50; index++) {
          app.ocr(`Sentence number ${index}.`, generation, 0, true);
          await new Promise((resolve) => setImmediate(resolve));
          expect(app.snapshot().dialogues.at(-1)?.status).toBe('translated');
          if (index < 20) expect(summary).not.toHaveBeenCalled();
          else {
            expect(summary).toHaveBeenCalledTimes(1);
            expect(summary.mock.calls[0][2].aborted).toBe(false);
          }
        }
        const thirteenth = translate.mock.calls[12][1];
        const fourteenth = translate.mock.calls[13][1];
        expect(fourteenth.slice(0, thirteenth.length - 1)).toEqual(thirteenth.slice(0, -1));
        expect(
          translate.mock.calls[49][1]
            .slice(1, -1)
            .map((message) => JSON.parse(message.content).source),
        ).toEqual(Array.from({ length: 13 }, (_, index) => `Sentence number ${index + 37}.`));
        app.runBackground();
        expect(summary).toHaveBeenCalledTimes(1);
        expect(JSON.parse(summary.mock.calls[0][1]).dialogues).toHaveLength(20);
        finishSummary('Đã nhớ hai mươi câu.');
        await vi.waitFor(() => expect(summary).toHaveBeenCalledTimes(2));
        expect(app.snapshot().session?.summarizedThrough).toBe(20);
        expect(JSON.parse(summary.mock.calls[1][1])).toMatchObject({
          summary: 'Đã nhớ hai mươi câu.',
          dialogues: expect.arrayContaining([
            expect.objectContaining({ text: 'Sentence number 21.' }),
          ]),
        });
        expect(app.snapshot().status).toBe('running');
        app.stop('paused');
        expect(summary.mock.calls[1][2].aborted).toBe(true);
        finishSummary('Kết quả đã cũ.');
        await new Promise((resolve) => setImmediate(resolve));
        expect(app.snapshot().session?.summarizedThrough).toBe(20);
      } finally {
        app.stop();
        db.close();
      }
    },
  );

  it.each(['lmStudio', 'ollama'] as const)(
    'khởi tạo và học hồ sơ qua %s khi đang dịch, không bị câu mới hủy hoặc học lặp',
    async (provider) => {
      const db = openDatabase(':memory:');
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', name: 'Game', aiEnabled: true });
      db.saveSettings({
        ...DEFAULT_SETTINGS,
        provider,
        lmStudioModel: 'local',
        ollamaModel: 'local',
        profileLearningInterval: 1,
      });
      const api = new OpenRouter(() => '');
      const facts: ProfileEnrichment = {
        characters: [],
        relationships: [],
        glossary: [],
        evidence: 'Chưa có dữ kiện.',
      };
      let finishProfile: (value: ProfileEnrichment) => void = () => undefined;
      const enrich = vi.spyOn(api, 'enrichProfile').mockImplementation(
        () =>
          new Promise((resolve) => {
            finishProfile = resolve;
          }),
      );
      const result = { translation: 'Chào.', speaker: 'Alice', listener: 'Bob' };
      let finishTranslation: (value: typeof result) => void = () => undefined;
      const translate = vi.spyOn(api, 'translate').mockImplementation(
        () =>
          new Promise((resolve) => {
            finishTranslation = resolve;
          }),
      );
      const app = new SessionController(db, api, () => undefined);
      try {
        app.openSession('game');
        const generation = app.begin();
        app.ready(generation);
        expect(enrich).toHaveBeenCalledTimes(1);
        app.ocr('Hello Alice', generation, 0, true);
        expect(app.snapshot().dialogues.at(-1)?.status).toBe('pending');
        expect(enrich.mock.calls[0][2].aborted).toBe(false);
        finishProfile(facts);
        await vi.waitFor(() => expect(db.profileInitialized('game')).toBe(true));
        finishTranslation(result);
        await vi.waitFor(() => expect(enrich).toHaveBeenCalledTimes(2));
        const sessionId = app.snapshot().session!.id;
        expect(JSON.parse(enrich.mock.calls[1][1])).toMatchObject({
          mode: 'learn',
          dialogues: [expect.objectContaining({ text: 'Hello Alice' })],
        });
        app.ocr('Another sentence', generation, 0, true);
        expect(app.snapshot().dialogues.at(-1)?.status).toBe('pending');
        expect(enrich.mock.calls[1][2].aborted).toBe(false);
        finishProfile({
          ...facts,
          relationships: [{ speaker: 'Alice', listener: 'Bob', self: 'chị', address: 'em' }],
        });
        await vi.waitFor(() => expect(db.profileLearningThrough(sessionId)).toBe(1));
        expect(
          app.snapshot().profiles.find((profile) => profile.id === 'game')?.relationships,
        ).toEqual([{ speaker: 'Alice', listener: 'Bob', self: 'chị', address: 'em' }]);
        expect(app.snapshot().status).toBe('running');
        app.runBackground();
        expect(enrich).toHaveBeenCalledTimes(2);
        finishTranslation(result);
        await vi.waitFor(() => expect(enrich).toHaveBeenCalledTimes(3));
        expect(JSON.parse(enrich.mock.calls[2][1]).dialogues).toEqual([
          expect.objectContaining({ text: 'Another sentence' }),
        ]);
        finishProfile(facts);
        await vi.waitFor(() => expect(db.profileLearningThrough(sessionId)).toBe(2));
        app.ocr('The next sentence', generation, 0, true);
        expect(JSON.stringify(translate.mock.calls[2][1])).toContain('chị');
        app.stop();
        finishTranslation(result);
        await new Promise((resolve) => setImmediate(resolve));
        expect(db.profileLearningThrough(sessionId)).toBe(2);
        expect(enrich).toHaveBeenCalledTimes(3);
      } finally {
        app.stop();
        db.close();
      }
    },
  );

  it('câu bị lọc chỉ hiện OCR, không tạo lịch sử, sequence, cache hoặc request', async () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    const api = new OpenRouter(() => 'key');
    const translate = vi
      .spyOn(api, 'translate')
      .mockResolvedValue({ translation: 'Chào.', speaker: 'unknown', listener: 'unknown' });
    const cache = vi.spyOn(db, 'cache');
    const app = new SessionController(db, api, () => undefined);
    try {
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'model' });
      app.environment(false, true);
      if (!app.snapshot().session) app.openSession('general');
      const generation = app.begin();
      for (const text of ['Hi', 'a12', '123456', '^%&*%$', '😀😀a'])
        app.ocr(text, generation, 0, true);
      expect(app.snapshot().ocrText).toBe('😀😀a');
      expect(app.snapshot().dialogues).toHaveLength(0);
      expect(db.dialogues(app.snapshot().session!.id)).toHaveLength(0);
      expect(cache).not.toHaveBeenCalled();
      expect(translate).not.toHaveBeenCalled();
      app.ocr('123a', generation, 0, true);
      await vi.waitFor(() => expect(app.snapshot().dialogues[0].status).toBe('translated'));
      expect(app.snapshot().dialogues[0].sequence).toBe(1);
    } finally {
      app.stop();
      db.close();
    }
  });
  it('OCR bị lọc không thay caption hợp lệ trước đó hoặc gia hạn thời gian', () => {
    vi.useFakeTimers();
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    const app = new SessionController(db, new OpenRouter(() => ''), () => undefined);
    try {
      if (!app.snapshot().session) app.openSession('general');
      const generation = app.begin();
      app.ocr('Hello world', generation, 0);
      expect(app.snapshot().overlayText).toBe('Hello world');
      vi.advanceTimersByTime(4000);
      app.ocr('12345', generation, 0);
      expect(app.snapshot().ocrText).toBe('12345');
      expect(app.snapshot().overlayText).toBe('Hello world');
      vi.advanceTimersByTime(1000);
      expect(app.snapshot().overlayText).toBe('');
    } finally {
      app.stop();
      db.close();
      vi.useRealTimers();
    }
  });
  it('hồ sơ dùng JSON có schema nhưng vẫn suy luận và đi qua pool nền', async () => {
    const data = {
      characters: [],
      relationships: [],
      glossary: [],
      evidence: 'Không biết game',
    };
    const translation = vi.fn<typeof fetch>();
    const background = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ ...data, instructions: 'Không được nhận quy tắc AI' }),
              },
            },
          ],
        }),
      ),
    );
    const api = new OpenRouter(() => 'key', translation, background);
    expect(
      await api.enrichProfile('profile-model', '{}', new AbortController().signal, 'game'),
    ).toEqual(data);
    const body = JSON.parse(String(background.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      model: 'profile-model',
      stream: false,
      reasoning: { enabled: true, exclude: true },
      session_id: 'game:profile',
    });
    expect(body.response_format.json_schema.name).toBe('profile_enrichment');
    expect(body.response_format.json_schema.schema.properties).not.toHaveProperty('instructions');
    expect(translation).not.toHaveBeenCalled();
  });
  it('tóm tắt không bị câu mới hủy và lưu được khi dịch vẫn chạy', async () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    const api = new OpenRouter(() => 'key');
    let finishSummary: (text: string) => void = () => undefined;
    const summary = vi.spyOn(api, 'summarize').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSummary = resolve;
        }),
    );
    vi.spyOn(api, 'translate').mockResolvedValue({
      translation: 'Chào con.',
      speaker: 'unknown',
      listener: 'unknown',
    });
    const app = new SessionController(db, api, () => undefined);
    try {
      app.updateSettings({ ...DEFAULT_SETTINGS, model: 'translation', summaryModel: 'summary' });
      app.environment(false, true);
      app.openSession('general');
      const session = app.snapshot().session!;
      for (let sequence = 1; sequence <= 19; sequence++)
        db.saveDialogue({
          id: String(sequence),
          sessionId: session.id,
          sequence,
          text: `Hello ${sequence}`,
          translation: 'Chào',
          speaker: 'unknown',
          listener: 'unknown',
          status: 'translated',
          createdAt: 0,
          ocrMs: 0,
          apiMs: 0,
        });
      app.openSession('general', session.id);
      if (!app.snapshot().session) app.openSession('general');
      const generation = app.begin();
      app.ocr('Hello twenty', generation, 0, true);
      await vi.waitFor(() => expect(summary).toHaveBeenCalledTimes(1));
      app.ocr('A different sentence', generation, 0, true);
      expect(summary.mock.calls[0][0]).toBe('summary');
      expect(summary.mock.calls[0][2].aborted).toBe(false);
      finishSummary('Đã nhớ hai mươi câu.');
      await vi.waitFor(() => expect(app.snapshot().session?.summarizedThrough).toBe(20));
      expect(app.snapshot().status).toBe('running');
    } finally {
      app.stop();
      db.close();
    }
  });
  it('tóm tắt dùng transport nền và giữ model được chọn', async () => {
    const translation = vi.fn<typeof fetch>();
    const background = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'Tóm tắt' } }] })),
      );
    const api = new OpenRouter(() => 'key', translation, background);
    expect(await api.summarize('summary-model', 'data', new AbortController().signal)).toBe(
      'Tóm tắt',
    );
    expect(translation).not.toHaveBeenCalled();
    expect(JSON.parse(String(background.mock.calls[0][1]?.body)).model).toBe('summary-model');
  });
  it('settings cũ nhận model dùng chung và nhịp học mặc định', () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    try {
      db.writeValue('preferences', JSON.stringify({ model: 'old' }));
      expect(db.settings()).toMatchObject({
        model: 'old',
        summaryModel: '',
        profileModel: '',
        profileLearningInterval: 20,
      });
      db.saveSettings({
        ...DEFAULT_SETTINGS,
        summaryModel: 'summary',
        profileModel: 'profile',
        profileLearningInterval: 1,
      });
      expect(db.settings().profileModel).toBe('profile');
    } finally {
      db.close();
    }
  });
  it('lưu hồ sơ cũ bị từ chối nếu revision đã thay đổi', () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, instructions: 'Bản mới' });
      expect(() => db.saveProfile({ ...DEFAULT_PROFILE, instructions: 'Bản cũ' })).toThrow(
        'PROFILE_CHANGED',
      );
      expect(db.profiles()[0].instructions).toBe('Bản mới');
    } finally {
      db.close();
    }
  });
});
