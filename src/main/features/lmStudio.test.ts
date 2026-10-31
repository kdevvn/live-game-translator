import { DEFAULT_PROFILE } from '../../shared/defaults';
import { describe, expect, it, vi } from 'vitest';
import { OpenRouter } from './openRouter';
import { DEFAULT_SETTINGS } from '../../shared/defaults';
import { settingsSchema } from '../../shared/types';
import { openDatabase } from '../database';
import { SessionController } from './session';
import { effectiveModel } from '../../shared/modelSettings';
import { getOverlayText } from '../../shared/overlay';

describe('LM Studio', () => {
  it.each(['lmStudio', 'ollama'] as const)(
    'tắt suy luận khi dịch qua %s và giữ nguyên JSON có cấu trúc',
    async (provider) => {
      const transport = vi.fn<typeof fetch>().mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                { message: { content: '{"translation":"Chào.","speaker":"","listener":""}' } },
              ],
            }),
          ),
      );
      const api = new OpenRouter(
        () => '',
        transport,
        transport,
        undefined,
        () => ({ provider, baseUrl: 'http://localhost:1234/v1' }),
      );
      const result = await api.translate('local', [], new AbortController().signal);
      expect(result.translation).toBe('Chào.');
      const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
      expect(body.reasoning_effort).toBe('none');
      expect(body.temperature).toBe(0);
      expect(body.stream_options).toEqual({ include_usage: true });
      expect(body.stream).toBe(true);
      expect(body.response_format.type).toBe('json_schema');
    },
  );

  it('server thiếu API metadata vẫn dùng danh sách chuẩn và không đoán gemma2 theo tên', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith('/api/v0/models')) return new Response('', { status: 404 });
      if (String(url).endsWith('/models'))
        return new Response(JSON.stringify({ data: [{ id: 'gemma-2-2b-it' }] }));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"translation":"Chào.","speaker":"","listener":""}' } }],
        }),
      );
    });
    const api = new OpenRouter(
      () => '',
      transport,
      transport,
      undefined,
      () => ({ provider: 'lmStudio', baseUrl: 'http://localhost:1234/v1' }),
    );
    expect((await api.models())[0].architecture).toBeUndefined();
    const messages = [
      { role: 'system' as const, content: 'Quy tắc' },
      { role: 'user' as const, content: 'Hello.' },
    ];
    await api.translate('gemma-2-2b-it', messages, new AbortController().signal);
    expect(transport.mock.calls[0][0]).toBe('http://localhost:1234/v1/models');
    expect(transport.mock.calls[1][0]).toBe('http://localhost:1234/api/v0/models');
    expect(JSON.parse(String(transport.mock.calls[2][1]?.body)).messages).toEqual(messages);
  });

  it('chỉ dùng model từ API chuẩn và ghép metadata theo mã model', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith('/api/v0/models')
              ? {
                  data: [
                    { id: 'gemma', arch: 'gemma2' },
                    { id: 'extra', arch: 'gemma2' },
                  ],
                }
              : { data: [{ id: 'gemma' }, { id: 'other' }] },
          ),
        ),
    );
    const api = new OpenRouter(
      () => '',
      transport,
      transport,
      undefined,
      () => ({ provider: 'lmStudio', baseUrl: 'http://localhost:11434/v1' }),
    );
    expect(await api.models()).toMatchObject([
      { id: 'gemma', architecture: 'gemma2' },
      { id: 'other' },
    ]);
    expect(await api.models()).toHaveLength(2);
  });

  it('vẫn trả danh sách chuẩn khi endpoint metadata gặp lỗi mạng', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith('/api/v0/models')) throw new TypeError('network error');
      return new Response(JSON.stringify({ data: [{ id: 'local' }] }));
    });
    const api = new OpenRouter(
      () => '',
      transport,
      transport,
      undefined,
      () => ({ provider: 'lmStudio', baseUrl: 'http://localhost:11434/v1' }),
    );
    expect(await api.models()).toMatchObject([{ id: 'local' }]);
  });

  it.each([
    { provider: 'lmStudio', architecture: 'gemma2', normalize: true },
    { provider: 'lmStudio', architecture: 'gemma4', normalize: false },
    { provider: 'lmStudio', architecture: undefined, normalize: false },
    { provider: 'openRouter', architecture: 'gemma2', normalize: false },
  ] as const)(
    'chỉ chuẩn hóa gemma2 qua LM Studio: $provider/$architecture',
    async ({ provider, architecture, normalize }) => {
      const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            choices: [
              { message: { content: '{"translation":"Chào.","speaker":"","listener":""}' } },
            ],
          }),
        );
      });
      const api = new OpenRouter(
        () => 'key',
        transport,
        transport,
        undefined,
        () => ({ provider, baseUrl: 'http://localhost:1234/v1' }),
      );
      api.setModels([{ id: 'gemma-2-2b-it', architecture, supportsStructuredOutputs: true }]);
      const messages = [
        { role: 'system' as const, content: 'Quy tắc dịch' },
        { role: 'system' as const, content: 'Schema JSON' },
        { role: 'user' as const, content: 'Tóm tắt cũ' },
        { role: 'user' as const, content: 'Câu trước' },
        { role: 'assistant' as const, content: 'Bản dịch trước' },
        { role: 'user' as const, content: 'Câu mới' },
      ];
      expect(
        (await api.translate('gemma-2-2b-it', messages, new AbortController().signal)).translation,
      ).toBe('Chào.');
      const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
      expect(body.messages).toEqual(
        !normalize
          ? messages
          : [
              { role: 'user', content: 'Quy tắc dịch\n\nSchema JSON\n\nTóm tắt cũ\n\nCâu trước' },
              { role: 'assistant', content: 'Bản dịch trước' },
              { role: 'user', content: 'Câu mới' },
            ],
      );

      expect(messages[0].role).toBe('system');
      expect(messages[2].content).toBe('Tóm tắt cũ');
    },
  );

  it('kiểm tra địa chỉ server và chuẩn hóa dấu gạch cuối', () => {
    const settings = { ...DEFAULT_SETTINGS, lmStudioBaseUrl: 'http://192.168.1.10:1234/v1/' };
    expect(settingsSchema.parse(settings).lmStudioBaseUrl).toBe('http://192.168.1.10:1234/v1');
    for (const url of [
      '',
      'not-a-url',
      'file:///tmp',
      'http://user:pass@localhost/v1',
      'http://localhost/v1?key=x',
      'http://localhost/v1#x',
    ])
      expect(settingsSchema.safeParse({ ...settings, lmStudioBaseUrl: url }).success).toBe(false);
  });

  it('tải model local thiếu metadata OpenRouter và dịch không cần token', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith('/models')
              ? { data: [{ id: 'local-model', object: 'model', arch: 'gemma2' }] }
              : {
                  choices: [
                    {
                      message: { content: '{"translation":"Chào.","speaker":"","listener":""}' },
                    },
                  ],
                },
          ),
        ),
    );
    const api = new OpenRouter(
      () => '',
      transport,
      transport,
      undefined,
      () => ({ provider: 'lmStudio', baseUrl: 'http://localhost:1234/v1' }),
    );
    const models = await api.models();
    expect(models[0]).toMatchObject({
      id: 'local-model',
      name: 'local-model',
      architecture: 'gemma2',
    });
    expect(models[0].contextLength).toBeUndefined();
    const result = await api.translate(
      'local-model',
      [],
      new AbortController().signal,
      undefined,
      'session',
    );
    expect(result.translation).toBe('Chào.');
    const options = transport.mock.calls[2][1];
    expect(options?.headers).not.toHaveProperty('Authorization');
    expect(options?.redirect).toBe('error');
    const payload = JSON.parse(String(options?.body));
    for (const field of ['provider', 'reasoning', 'session_id'])
      expect(payload).not.toHaveProperty(field);
    expect(options?.headers).not.toHaveProperty('X-OpenRouter-Cache');
    expect(payload.response_format.type).toBe('json_schema');
  });

  it('overlay dùng bản dịch local dù không có API key', () => {
    expect(
      getOverlayText({
        settings: { ...DEFAULT_SETTINGS, provider: 'lmStudio', lmStudioModel: 'local-model' },
        hasApiKey: false,
        ocrText: 'Hello.',
        dialogues: [
          {
            id: 'd',
            sessionId: 's',
            sequence: 1,
            text: 'Hello.',
            speaker: '',
            listener: '',
            createdAt: 0,
            ocrMs: 0,
            apiMs: 0,
            status: 'translated',
            translation: 'Chào.',
          },
        ],
      }),
    ).toBe('Chào.');
  });
});

describe('Luồng model local', () => {
  it('Ollama dùng API chuẩn và giữ cấu hình riêng với LM Studio', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'ollama-model' }] })));
    const api = new OpenRouter(
      () => '',
      transport,
      transport,
      undefined,
      () => ({ provider: 'ollama', baseUrl: 'http://localhost:11434/v1' }),
    );
    expect(await api.models()).toMatchObject([{ id: 'ollama-model' }]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe('http://localhost:11434/v1/models');
    const db = openDatabase(':memory:');
    try {
      db.writeValue(
        'preferences',
        JSON.stringify({ provider: 'lmStudio', lmStudioModel: 'old-model' }),
      );
      expect(db.settings().lmStudioModel).toBe('old-model');
      expect(db.settings().ollamaBaseUrl).toBe('http://localhost:11434/v1');
      db.saveSettings({ ...db.settings(), provider: 'ollama', ollamaModel: 'ollama-model' });
      expect(effectiveModel(db.settings())).toBe('ollama-model');
      expect(db.settings().lmStudioModel).toBe('old-model');
    } finally {
      db.close();
    }
  });

  it('khôi phục cấu hình cũ và giữ model riêng từng provider', () => {
    const db = openDatabase(':memory:');
    try {
      db.writeValue('preferences', JSON.stringify({ model: 'cloud' }));
      expect(db.settings().provider).toBe('openRouter');
      const local = { ...db.settings(), provider: 'lmStudio' as const, lmStudioModel: 'local' };
      db.saveSettings(local);
      expect(effectiveModel(db.settings(), 'summary')).toBe('local');
      expect(effectiveModel({ ...db.settings(), provider: 'openRouter' }, 'profile')).toBe('cloud');
    } finally {
      db.close();
    }
  });

  it('dịch không key, đổi server hủy request và không dùng cache server cũ', async () => {
    const db = openDatabase(':memory:');
    const api = new OpenRouter(() => '');
    const translate = vi
      .spyOn(api, 'translate')
      .mockResolvedValue({ translation: 'Chào.', speaker: '', listener: '' });
    const app = new SessionController(db, api, () => undefined);
    try {
      app.updateSettings({
        ...app.snapshot().settings,
        provider: 'lmStudio',
        lmStudioModel: 'local',
      });
      db.saveProfile(DEFAULT_PROFILE);
      app.openSession('general');
      app.begin();
      app.ocr('Hello.', app.snapshot().generation, 1, true);
      await vi.waitFor(() => expect(app.snapshot().dialogues[0]?.translation).toBe('Chào.'));
      app.openSession('general');
      app.updateSettings({
        ...app.snapshot().settings,
        lmStudioBaseUrl: 'http://localhost:9999/v1',
      });
      app.begin();
      app.ocr('Hello.', app.snapshot().generation, 1, true);
      await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(app.snapshot().dialogues[0]?.status).toBe('translated'));
      let finish:
        ((value: { translation: string; speaker: string; listener: string }) => void) | undefined;
      translate.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      app.ocr('Follow me.', app.snapshot().generation, 1, true);
      await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(3));
      const signal = translate.mock.calls[2][2];
      app.updateSettings({ ...app.snapshot().settings, provider: 'openRouter' });
      expect(signal.aborted).toBe(true);
      finish?.({ translation: 'Theo tôi.', speaker: '', listener: '' });
      await new Promise((resolve) => setImmediate(resolve));
      expect(app.snapshot().status).toBe('paused');
      expect(app.snapshot().dialogues.at(-1)?.translation).toBe('');
    } finally {
      app.stop();
      db.close();
    }
  });

  it('gửi token local tới đúng server và phát bản nháp SSE', async () => {
    const text = '{"translation":"Chào.","speaker":"","listener":""}';
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(
            `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`,
            { headers: { 'content-type': 'text/event-stream' } },
          ),
      );
    const api = new OpenRouter(
      () => 'local-token',
      transport,
      transport,
      undefined,
      () => ({ provider: 'lmStudio', baseUrl: 'http://192.168.1.10:1234/v1' }),
    );
    const progress = vi.fn();
    expect(
      (await api.translate('local', [], new AbortController().signal, progress)).translation,
    ).toBe('Chào.');
    expect(progress).toHaveBeenCalledWith('Chào.');
    expect(transport.mock.calls[0][0]).toBe('http://192.168.1.10:1234/v1/chat/completions');
    expect(transport.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer local-token',
    });
  });

  it.each([401, 400, 302])('báo lỗi server %s và không tự đổi provider', async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response('', { status }));
    const api = new OpenRouter(
      () => '',
      transport,
      transport,
      undefined,
      () => ({ provider: 'lmStudio', baseUrl: 'http://localhost:1234/v1' }),
    );
    await expect(api.translate('local', [], new AbortController().signal)).rejects.toThrow(
      status === 401 ? 'API_KEY' : status === 400 ? 'MODEL' : 'NETWORK',
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('báo lỗi khi model trả JSON sai', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Hello' } }] })),
      );
    const api = new OpenRouter(
      () => '',
      transport,
      transport,
      undefined,
      () => ({ provider: 'lmStudio', baseUrl: 'http://localhost:1234/v1' }),
    );
    await expect(api.translate('local', [], new AbortController().signal)).rejects.toThrow(
      'RESPONSE',
    );
  });
});

describe('Tác vụ và timeout local', () => {
  it.each(['gemma2', 'gemma4'])('tóm tắt và hồ sơ theo đúng kiến trúc %s', async (architecture) => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      const content = body.response_format
        ? JSON.stringify({
            characters: [],
            relationships: [],
            glossary: [],
            evidence: 'Không có dữ kiện.',
          })
        : 'Tóm tắt.';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
    });
    const api = new OpenRouter(
      () => '',
      transport,
      transport,
      undefined,
      () => ({ provider: 'lmStudio', baseUrl: 'http://localhost:1234/v1' }),
    );
    api.setModels(
      ['summary-local', 'profile-local'].map((id) => ({
        id,
        architecture,
        supportsStructuredOutputs: true,
      })),
    );
    expect(await api.summarize('summary-local', '{}', new AbortController().signal)).toBe(
      'Tóm tắt.',
    );
    expect(
      (await api.enrichProfile('profile-local', '{}', new AbortController().signal)).evidence,
    ).toBe('Không có dữ kiện.');
    for (const [, options] of transport.mock.calls) {
      const body = JSON.parse(String(options?.body));
      expect(body.messages.map((message: { role: string }) => message.role)).toEqual(
        architecture === 'gemma2' ? ['user'] : ['system', 'user'],
      );
      expect(body).not.toHaveProperty('reasoning');
      expect(body).not.toHaveProperty('reasoning_effort');
      expect(body).not.toHaveProperty('temperature');
      expect(body).not.toHaveProperty('provider');
    }
  });

  it.each(['translation', 'summary', 'profile'] as const)(
    'giữ timeout hiện tại cho %s local',
    async (purpose) => {
      vi.useFakeTimers();
      try {
        const transport: typeof fetch = async (_url, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          });
        const api = new OpenRouter(
          () => '',
          transport,
          transport,
          undefined,
          () => ({ provider: 'lmStudio', baseUrl: 'http://localhost:1234/v1' }),
        );
        const signal = new AbortController().signal;
        const pending =
          purpose === 'translation'
            ? api.translate('local', [], signal)
            : purpose === 'summary'
              ? api.summarize('local', '{}', signal)
              : api.enrichProfile('local', '{}', signal);
        const assertion = expect(pending).rejects.toThrow('TIMEOUT');
        await vi.advanceTimersByTimeAsync(purpose === 'translation' ? 20000 : 240000);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
