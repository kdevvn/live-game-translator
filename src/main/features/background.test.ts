import { describe, expect, it, vi } from 'vitest';
import { OpenRouter } from './openRouter';
import { openDatabase } from '../database';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../../shared/defaults';
import { SessionController } from './session';

describe('Model và transport tác vụ nền', () => {
  it.each(['openRouter', 'lmStudio', 'ollama'] as const)(
    '%s bỏ qua tóm tắt khi tắt, hủy kết quả muộn và bật lại khi đang dịch',
    async (provider) => {
      const db = openDatabase(':memory:');
      db.saveProfile(DEFAULT_PROFILE);
      const session = db.createSession('general');
      db.saveSession({ ...session, summary: 'Ngữ cảnh cũ được giữ lại.' });
      for (let sequence = 1; sequence <= 20; sequence++)
        db.saveDialogue({
          id: String(sequence),
          sessionId: session.id,
          sequence,
          text: `Hello ${sequence}`,
          translation: 'Chào.',
          speaker: 'Alice',
          listener: 'Bob',
          status: 'translated',
          createdAt: 0,
          ocrMs: 0,
          apiMs: 0,
        });
      const api = new OpenRouter(() => 'key');
      let finishSummary: (text: string) => void = () => undefined;
      const summary = vi.spyOn(api, 'summarize').mockImplementation(
        () =>
          new Promise((resolve) => {
            finishSummary = resolve;
          }),
      );
      const result = { translation: 'Chào.', speaker: 'Alice', listener: 'Bob' };
      let finishTranslation: (value: typeof result) => void = () => undefined;
      const translate = vi
        .spyOn(api, 'translate')
        .mockResolvedValue(result)
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishTranslation = resolve;
            }),
        );
      const app = new SessionController(db, api, () => undefined);
      try {
        app.updateSettings({
          ...DEFAULT_SETTINGS,
          provider,
          model: 'cloud',
          lmStudioModel: 'local',
          ollamaModel: 'local',
        });
        app.environment(false, true);
        app.openSession('general', session.id);
        app.ready(app.begin());
        app.runBackground();
        app.ocr('New dialogue.', app.snapshot().generation, 0, true);
        expect(summary).not.toHaveBeenCalled();
        expect(
          translate.mock.calls[0][1].some((message) => message.content.includes('previousSummary')),
        ).toBe(false);
        expect(app.snapshot().dialogues.at(-1)?.status).toBe('pending');
        app.updateSettings({ ...app.snapshot().settings, summaryEnabled: true });
        expect(summary).toHaveBeenCalledTimes(1);
        expect(app.snapshot().summaryLoading).toBe(true);
        app.updateSettings({ ...app.snapshot().settings, summaryEnabled: false });
        expect(summary.mock.calls[0][2].aborted).toBe(true);
        expect(app.snapshot().summaryLoading).toBe(false);
        finishSummary('Kết quả trả muộn.');
        await new Promise((resolve) => setImmediate(resolve));
        expect(db.sessions().find((row) => row.id === session.id)).toMatchObject({
          summary: 'Ngữ cảnh cũ được giữ lại.',
          summarizedThrough: 0,
        });
        app.updateSettings({ ...app.snapshot().settings, summaryEnabled: true });
        expect(summary).toHaveBeenCalledTimes(2);
        finishSummary('Tóm tắt mới.');
        await vi.waitFor(() => expect(app.snapshot().session?.summarizedThrough).toBe(20));
        expect(app.snapshot().dialogues.at(-1)?.status).toBe('pending');
        finishTranslation(result);
        await vi.waitFor(() => expect(app.snapshot().dialogues.at(-1)?.status).toBe('translated'));
        app.ocr('Another dialogue.', app.snapshot().generation, 0, true);
        expect(
          translate.mock.calls[1][1].some(
            (message) => message.content === JSON.stringify({ previousSummary: 'Tóm tắt mới.' }),
          ),
        ).toBe(true);
        expect(summary).toHaveBeenCalledTimes(2);
        expect(app.snapshot().status).toBe('running');
        await vi.waitFor(() => expect(app.snapshot().dialogues.at(-1)?.status).toBe('translated'));
      } finally {
        app.stop();
        db.close();
      }
    },
  );

  it.each(['openRouter', 'lmStudio', 'ollama'] as const)(
    'giữ lịch sử theo lô và tóm tắt song song qua %s suốt 50 câu',
    async (provider) => {
      const db = openDatabase(':memory:');
      db.saveProfile({ ...DEFAULT_PROFILE, speakerDisplay: 'none' });
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
          summaryEnabled: true,
          model: 'cloud',
          lmStudioModel: 'local',
          ollamaModel: 'local',
        });
        app.environment(false, true);
        app.openSession('general');
        const generation = app.begin();
        app.ready(generation);
        for (let index = 1; index <= 50; index++) {
          app.ocr(`Sentence number ${index}.`, generation, 0, true);
          await vi.waitFor(() =>
            expect(app.snapshot().dialogues.at(-1)?.status).toBe('translated'),
          );
        }
        expect(summary).toHaveBeenCalledTimes(1);
        expect(summary.mock.calls[0][2].aborted).toBe(false);
        const thirteenth = translate.mock.calls[12][1];
        const fourteenth = translate.mock.calls[13][1];
        expect(fourteenth.slice(0, thirteenth.length - 1)).toEqual(thirteenth.slice(0, -1));
        expect(
          translate.mock.calls[49][1]
            .slice(1, -1)
            .filter((message) => message.role === 'user')
            .map((message) => JSON.parse(message.content).ocr),
        ).toEqual(Array.from({ length: 13 }, (_, index) => `Sentence number ${index + 37}.`));
        app.runBackground();
        expect(summary).toHaveBeenCalledTimes(1);
        expect(JSON.parse(summary.mock.calls[0][1]).dialogues).toHaveLength(20);
        app.retry(app.snapshot().dialogues[0].id);
        expect(summary.mock.calls[0][2].aborted).toBe(false);
        finishSummary('Đã nhớ hai mươi câu.');
        await vi.waitFor(() => expect(app.snapshot().session?.summarizedThrough).toBe(20));
        expect(summary).toHaveBeenCalledTimes(2);
        expect(app.snapshot().status).toBe('running');
        expect(JSON.parse(summary.mock.calls[1][1]).summary).toBe('Đã nhớ hai mươi câu.');
        expect(JSON.parse(summary.mock.calls[1][1]).dialogues[0].text).toBe('Sentence number 21.');
        app.openSession('general');
        expect(summary.mock.calls[1][2].aborted).toBe(true);
        finishSummary('Kết quả đã cũ.');
        await new Promise((resolve) => setImmediate(resolve));
        expect(app.snapshot().session?.summarizedThrough).toBe(0);
      } finally {
        app.stop();
        db.close();
      }
    },
  );

  it.each(['openRouter', 'lmStudio', 'ollama'] as const)(
    'khởi tạo hồ sơ qua %s chạy song song với câu dịch mới',
    async (provider) => {
      const db = openDatabase(':memory:');
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', name: 'Game', aiEnabled: true });
      const api = new OpenRouter(() => '');
      const enrich = vi
        .spyOn(api, 'enrichProfile')
        .mockImplementationOnce(
          (_model, _data, signal) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(new Error('CANCELLED')), {
                once: true,
              });
            }),
        )
        .mockImplementationOnce(() => new Promise(() => undefined));
      const translate = vi
        .spyOn(api, 'translate')
        .mockImplementation(() => new Promise(() => undefined));
      const app = new SessionController(db, api, () => undefined);
      try {
        app.updateSettings({
          ...DEFAULT_SETTINGS,
          provider,
          model: 'cloud',
          lmStudioModel: 'local',
          ollamaModel: 'local',
        });
        app.environment(false, true);
        expect(enrich).toHaveBeenCalledTimes(1);
        app.openSession('game');
        app.ready(app.begin());
        app.retryProfile('game');
        expect(enrich.mock.calls[0][2].aborted).toBe(true);
        expect(enrich).toHaveBeenCalledTimes(2);
        app.ocr('Hello world.', app.snapshot().generation, 0, true);
        await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
        expect(app.snapshot().dialogues.at(-1)?.status).toBe('pending');
        expect(enrich.mock.calls[1][2].aborted).toBe(false);
        app.stop();
        expect(enrich.mock.calls[1][2].aborted).toBe(true);
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
    expect(body.response_format.json_schema.schema.properties).not.toHaveProperty('glossary');
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
      app.updateSettings({
        ...DEFAULT_SETTINGS,
        summaryEnabled: true,
        model: 'translation',
        summaryModel: 'summary',
      });
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
