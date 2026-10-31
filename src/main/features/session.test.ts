import { DEFAULT_PROFILE } from '../../shared/defaults';
import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../database';
import { SessionController } from './session';
import { OpenRouter } from './openRouter';
import { getOverlayText } from '../../shared/overlay';

describe('Vòng đời phiên dịch', () => {
  it('overlay tự ẩn dù OCR lặp chữ, câu mới hiện lại và dừng xóa timer', async () => {
    vi.useFakeTimers();
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    const changed = vi.fn();
    const app = new SessionController(db, new OpenRouter(() => ''), changed);
    try {
      app.updateSettings({ ...app.snapshot().settings, overlayDurationSeconds: 2 });
      if (!app.snapshot().session) app.openSession('general');
      app.begin();
      const generation = app.snapshot().generation;
      app.ocr('Stay close.', generation, 1);
      expect(app.snapshot().overlayText).toBe('Stay close.');
      await vi.advanceTimersByTimeAsync(1500);
      app.ocr('Stay close.', generation, 1);
      await vi.advanceTimersByTimeAsync(500);
      expect(app.snapshot().overlayText).toBe('');
      app.ocr('Stay close.', generation, 1);
      expect(app.snapshot().overlayText).toBe('');
      app.overlay(true);
      expect(app.snapshot().overlayEditing).toBe(true);
      expect(app.snapshot().overlayText).toBe('');
      app.ocr('Follow me.', generation, 1);
      expect(app.snapshot().overlayText).toBe('Follow me.');
      app.updateSettings({ ...app.snapshot().settings, overlayDurationSeconds: 1 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(app.snapshot().overlayText).toBe('');
      app.ocr('Come on.', generation, 1);
      app.stop();
      expect(app.snapshot().overlayText).toBe('');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      app.stop();
      db.close();
      vi.useRealTimers();
    }
  });
  it('cache không tính lại token của request gốc và phiên mới không mang mốc lọc cũ', async () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    const api = new OpenRouter(() => 'key');
    const translate = vi.spyOn(api, 'translate').mockResolvedValue({
      translation: 'Chào.',
      speaker: 'unknown',
      listener: 'unknown',
      usage: { inputTokens: 300, outputTokens: 20 },
      costUsd: 0.0002,
      modelId: 'vendor/actual-model:free',
    });
    const app = new SessionController(db, api, () => undefined);
    app.updateSettings({ ...app.snapshot().settings, model: 'test' });
    app.environment(false, true);
    try {
      if (!app.snapshot().session) app.openSession('general');
      app.begin();
      const firstSessionId = app.snapshot().session?.id;
      app.ocr('Hello.', app.snapshot().generation, 1, true);
      await new Promise((resolve) => setImmediate(resolve));
      expect(app.snapshot().dialogues[0].usage).toEqual({ inputTokens: 300, outputTokens: 20 });
      expect(db.dialogues(app.snapshot().session?.id ?? '')[0].costUsd).toBe(0.0002);
      expect(translate.mock.calls[0][4]).toBe(firstSessionId);
      app.openSession('general');
      if (!app.snapshot().session) app.openSession('general');
      app.begin();
      app.ocr('Hello.', app.snapshot().generation, 1, true);
      await new Promise((resolve) => setImmediate(resolve));
      expect(translate).toHaveBeenCalledTimes(1);
      expect(app.snapshot().dialogues[0]).toMatchObject({
        fromCache: true,
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 0,
        modelId: 'vendor/actual-model:free',
      });
    } finally {
      app.stop();
      db.close();
    }
  });
  it('không lọc câu theo mốc lỗi và cho thử lại thủ công', async () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    const api = new OpenRouter(() => 'key');
    const translate = vi
      .spyOn(api, 'translate')
      .mockRejectedValueOnce(new Error('NETWORK'))
      .mockResolvedValue({ translation: 'Chào.', speaker: 'unknown', listener: 'unknown' });
    const app = new SessionController(db, api, () => undefined);
    app.updateSettings({ ...app.snapshot().settings, model: 'test', autoTranslate: true });
    app.environment(false, true);
    if (!app.snapshot().session) app.openSession('general');
    app.begin();
    const now = vi.spyOn(Date, 'now');
    try {
      app.ocr('Hello.', app.snapshot().generation, 1, true);
      await new Promise((resolve) => setImmediate(resolve));
      const failed = app.snapshot().dialogues[0];
      expect(failed.status).toBe('error');
      now.mockReturnValue(0);
      app.ocr('Hello!', app.snapshot().generation, 1);
      now.mockReturnValue(200);
      app.ocr('Hello!', app.snapshot().generation, 1);
      await new Promise((resolve) => setImmediate(resolve));
      expect(translate).toHaveBeenCalledTimes(2);
      app.retry(failed.id);
      await new Promise((resolve) => setImmediate(resolve));
      expect(translate).toHaveBeenCalledTimes(3);
    } finally {
      now.mockRestore();
      app.stop();
      db.close();
    }
  });
  it('lọc câu gần giống ở chế độ tự động, không trôi mốc và giữ nguyên hoa thường gửi AI', async () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '{"translation":"Con không hiểu.","speaker":"Atreus","listener":"unknown"}',
                },
              },
            ],
            usage: { prompt_tokens: 321, completion_tokens: 22 },
          }),
        ),
    );
    const app = new SessionController(db, new OpenRouter(() => 'key', transport), () => undefined);
    app.updateSettings({ ...app.snapshot().settings, model: 'test', autoTranslate: true });
    app.environment(false, true);
    if (!app.snapshot().session) app.openSession('general');
    app.begin();
    const now = vi.spyOn(Date, 'now');
    let time = 0;
    /** Đưa một câu qua thời gian ổn định, không dùng sleep thật. */
    async function send(text: string, manual = false): Promise<void> {
      now.mockReturnValue(time);
      app.ocr(text, app.snapshot().generation, 12, manual);
      now.mockReturnValue(time + 200);
      if (!manual) app.ocr(text, app.snapshot().generation, 12);
      time += 1000;
      await new Promise((resolve) => setImmediate(resolve));
    }
    try {
      const original = 'Atreus: That can NOT be my future';
      await send(original);
      await send(`${original}.`);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(String(transport.mock.calls[0][1]?.body)).messages.at(-1).content,
      ).toContain(original);
      expect(app.snapshot().dialogues[0]).toMatchObject({
        text: original,
        usage: { inputTokens: 321, outputTokens: 22 },
      });
      expect(db.dialogues(app.snapshot().session?.id ?? '')[0].usage).toEqual({
        inputTokens: 321,
        outputTokens: 22,
      });
      await send('Something completely different.');
      await send(original);
      expect(transport).toHaveBeenCalledTimes(3);
      await send('');
      await send(original);
      expect(transport).toHaveBeenCalledTimes(4);
      await send(`${original}!`, true);
      expect(transport).toHaveBeenCalledTimes(5);
    } finally {
      now.mockRestore();
      app.stop();
      db.close();
    }
  });
  it('so với câu đã chấp nhận thay vì câu bị bỏ, cho đổi ngưỡng và tắt lọc ngay', async () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    const api = new OpenRouter(() => 'key', transport);
    const translate = vi
      .spyOn(api, 'translate')
      .mockResolvedValue({ translation: 'Thử.', speaker: 'unknown', listener: 'unknown' });
    const app = new SessionController(db, api, () => undefined);
    app.updateSettings({ ...app.snapshot().settings, model: 'test', autoTranslate: true });
    app.environment(false, true);
    if (!app.snapshot().session) app.openSession('general');
    app.begin();
    const now = vi.spyOn(Date, 'now');
    let time = 0;
    /** Xác nhận câu ổn định theo clock giả lập. */
    async function send(text: string): Promise<void> {
      now.mockReturnValue(time);
      app.ocr(text, app.snapshot().generation, 1);
      now.mockReturnValue(time + 200);
      app.ocr(text, app.snapshot().generation, 1);
      time += 1000;
      await new Promise((resolve) => setImmediate(resolve));
    }
    try {
      await send('abcde');
      await send('abcdf');
      await send('abcgf');
      expect(translate).toHaveBeenCalledTimes(2);
      app.updateSettings({ ...app.snapshot().settings, duplicateThreshold: 100 });
      await send('abcgh');
      expect(translate).toHaveBeenCalledTimes(3);
      app.updateSettings({ ...app.snapshot().settings, duplicateThreshold: 0 });
      await send('abcgi');
      expect(translate).toHaveBeenCalledTimes(4);
    } finally {
      now.mockRestore();
      app.stop();
      db.close();
    }
  });
  it.each(['complete', 'error', 'cancel'])(
    'stream %s: hiện sớm nhưng chỉ lưu kết quả hoàn chỉnh',
    async (ending) => {
      const db = openDatabase(':memory:');
      db.saveProfile(DEFAULT_PROFILE);
      let feed: ReadableStreamDefaultController<Uint8Array> | undefined;
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            feed = controller;
          },
        }),
        {
          headers: { 'content-type': 'text/event-stream' },
        },
      );
      const app = new SessionController(
        db,
        new OpenRouter(
          () => 'key',
          async () => response,
        ),
        () => undefined,
      );
      app.updateSettings({ ...app.snapshot().settings, model: 'test-model' });
      app.environment(false, true);
      if (!app.snapshot().session) app.openSession('general');
      app.begin();
      const sessionId = app.snapshot().session?.id ?? '';
      const encoder = new TextEncoder();
      app.ocr('Stay close.', app.snapshot().generation, 10, true);
      try {
        feed?.enqueue(
          encoder.encode(
            'data: ' +
              JSON.stringify({ choices: [{ delta: { content: '{"translation":"Đi' } }] }) +
              '\n\n',
          ),
        );
        await vi.waitFor(() => expect(getOverlayText(app.snapshot())).toBe('Đi'));
        expect(app.snapshot().dialogues[0].status).toBe('pending');
        expect(app.snapshot().dialogues[0].firstTextMs).toBeGreaterThanOrEqual(0);
        expect(db.dialogues(sessionId)[0].translation).toBe('');
        if (ending === 'cancel') {
          app.openSession('general');
          await new Promise((resolve) => setImmediate(resolve));
          expect(getOverlayText(app.snapshot())).toBe('');
          expect(db.dialogues(sessionId)[0]).toMatchObject({
            status: 'cancelled',
            translation: '',
          });
        } else {
          const event =
            ending === 'complete'
              ? {
                  choices: [
                    {
                      delta: { content: ' sát ta.","speaker":"Father","listener":"Son"}' },
                      finish_reason: 'stop',
                    },
                  ],
                }
              : { error: { code: 'server_error' } };
          feed?.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`));
          feed?.close();
          await vi.waitFor(() =>
            expect(app.snapshot().dialogues[0].status).toBe(
              ending === 'complete' ? 'translated' : 'error',
            ),
          );
          expect(db.dialogues(sessionId)[0].translation).toBe(
            ending === 'complete' ? 'Đi sát ta.' : '',
          );
          expect(getOverlayText(app.snapshot())).toBe(ending === 'complete' ? 'Đi sát ta.' : '');
        }
      } finally {
        app.stop();
        await new Promise((resolve) => setImmediate(resolve));
        db.close();
      }
    },
  );
  it('nhấn dịch lặp trong khi đang chờ không tạo thêm request cho cùng câu', async () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    let release: ((value: Response) => void) | undefined;
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const app = new SessionController(db, new OpenRouter(() => 'key', transport), () => undefined);
    app.updateSettings({ ...app.snapshot().settings, model: 'test-model', autoTranslate: true });
    app.environment(false, true);
    if (!app.snapshot().session) app.openSession('general');
    app.begin();
    const generation = app.snapshot().generation;
    app.ocr('Stay close.', generation, 10, true);
    app.ocr('Stay close.', generation, 10, true);
    expect(app.snapshot().dialogues).toHaveLength(1);
    app.stop();
    release?.(new Response('{}'));
    await new Promise((resolve) => setImmediate(resolve));
    db.close();
  });
  it('chưa cấu hình dịch thì chỉ cập nhật OCR, không gọi API hoặc báo lỗi key', () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    const transport = vi.fn();
    const app = new SessionController(db, new OpenRouter(() => '', transport), () => undefined);
    app.updateSettings({ ...app.snapshot().settings, autoTranslate: true });
    if (!app.snapshot().session) app.openSession('general');
    app.begin();
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(0);
      app.ocr('Stay close.', app.snapshot().generation, 10);
      now.mockReturnValue(1000);
      app.ocr('Stay close.', app.snapshot().generation, 10, true);
      expect(app.snapshot().ocrText).toBe('Stay close.');
      expect(app.snapshot().error).toBeNull();
      expect(app.snapshot().dialogues).toEqual([]);
      expect(transport).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
      app.stop();
      db.close();
    }
  });
  it('dịch tự động chỉ gửi câu đã ổn định và tiếp tục được khi tóm tắt lỗi', async () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    let calls = 0;
    let summaries = 0;
    const api = new OpenRouter(
      () => 'fake-key',
      async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { response_format?: unknown };
        if (!body.response_format) {
          summaries++;
          return new Response(JSON.stringify({ choices: [] }));
        }
        calls++;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    translation: 'Chào con.',
                    speaker: 'Father',
                    listener: 'Son',
                  }),
                },
              },
            ],
          }),
        );
      },
    );
    const app = new SessionController(db, api, () => undefined);
    app.updateSettings({
      ...app.snapshot().settings,
      model: 'test-model',
      autoTranslate: true,
      duplicateThreshold: 0,
    });
    app.environment(false, true);
    app.openSession('general');
    if (!app.snapshot().session) app.openSession('general');
    app.begin();
    const now = vi.spyOn(Date, 'now');
    try {
      for (let i = 0; i < 21; i++) {
        now.mockReturnValue(i * 1000);
        app.ocr(`Hello ${i}`, app.snapshot().generation, 10);
        expect(calls).toBe(i);
        now.mockReturnValue(i * 1000 + 500);
        app.ocr(`Hello ${i}`, app.snapshot().generation, 10);
        await new Promise((resolve) => setImmediate(resolve));
      }
      expect(calls).toBe(21);
      expect(summaries).toBeGreaterThan(0);
      expect(app.snapshot().status).toBe('running');
      expect(app.snapshot().dialogues.every((d) => d.status === 'translated')).toBe(true);
    } finally {
      now.mockRestore();
      app.stop();
      db.close();
    }
  });
  it('không nhận OCR từ generation cũ và đổi phiên không mang hội thoại cũ', () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    const app = new SessionController(db, new OpenRouter(() => ''), () => undefined);
    app.openSession('general');
    if (!app.snapshot().session) app.openSession('general');
    app.begin();
    const generation = app.snapshot().generation;
    app.stop('paused');
    app.ocr('Old text', generation, 10);
    expect(app.snapshot().ocrText).toBe('');
    if (!app.snapshot().session) app.openSession('general');
    app.begin();
    app.ocr('New text', app.snapshot().generation, 20);
    expect(app.snapshot().ocrText).toBe('New text');
    app.openSession('general');
    expect(app.snapshot().dialogues).toEqual([]);
    expect(app.snapshot().status).toBe('idle');
    db.close();
  });
  it('đổi locale không dừng phiên hoặc đổi ngôn ngữ dịch', () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    const app = new SessionController(db, new OpenRouter(() => ''), () => undefined);
    app.openSession('general');
    if (!app.snapshot().session) app.openSession('general');
    app.begin();
    app.updateSettings({ ...app.snapshot().settings, locale: 'en' });
    expect(app.snapshot().status).toBe('starting');
    expect(app.snapshot().settings.locale).toBe('en');
    app.stop();
    db.close();
  });
  it('kết quả API về sau khi đổi phiên không được ghi hoặc đưa lên overlay', async () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    let release: ((response: Response) => void) | undefined;
    const transport: typeof fetch = async () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    const app = new SessionController(
      db,
      new OpenRouter(() => 'fake-key', transport),
      () => undefined,
    );
    app.updateSettings({ ...app.snapshot().settings, model: 'test-model' });
    app.environment(false, true);
    app.openSession('general');
    if (!app.snapshot().session) app.openSession('general');
    app.begin();
    app.ocr('Hello', app.snapshot().generation, 10, true);
    const oldSession = app.snapshot().session;
    expect(app.snapshot().dialogues[0].status).toBe('pending');
    app.openSession('general');
    release?.(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  translation: 'Chào',
                  speaker: 'unknown',
                  listener: 'unknown',
                }),
              },
            },
          ],
        }),
      ),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(app.snapshot().dialogues).toEqual([]);
    expect(db.dialogues(oldSession?.id ?? '')[0].status).toBe('cancelled');
    db.close();
  });
});
