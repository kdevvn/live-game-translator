import { describe, expect, it, vi } from 'vitest';
import { OpenRouter } from './openRouter';
import { DebugLog } from './debugLog';

describe('OpenRouter', () => {
  it.each(['summary', 'profile'] as const)('chờ tối đa 240 giây cho tác vụ %s', async (purpose) => {
    vi.useFakeTimers();
    try {
      const transport: typeof fetch = async (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      const api = new OpenRouter(() => 'key', transport);
      const pending =
        purpose === 'summary'
          ? api.summarize('model', '{}', new AbortController().signal)
          : api.enrichProfile('model', '{}', new AbortController().signal);
      const assertion = expect(pending).rejects.toThrow('TIMEOUT');
      await vi.advanceTimersByTimeAsync(239_999);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
  it('không bật web search cho tác vụ hồ sơ', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    characters: [],
                    relationships: [],
                    glossary: [],
                    evidence: 'test',
                  }),
                },
              },
            ],
          }),
        ),
    );
    const api = new OpenRouter(() => 'key', transport);
    await api.enrichProfile('model', '{}', new AbortController().signal, 'game');
    await api.enrichProfile('model', '{}', new AbortController().signal, 'game');
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).plugins).toBeUndefined();
    expect(JSON.parse(String(transport.mock.calls[1][1]?.body)).plugins).toBeUndefined();
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).messages[0].content).toContain(
      'từng chiều',
    );
  });
  it('đọc giá theo triệu token và tải danh sách không cần key', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'm',
              name: 'Model',
              context_length: 100,
              pricing: { prompt: '0.000001', completion: '0.000002' },
            },
          ],
        }),
      ),
    );
    const models = await new OpenRouter(() => '', transport).models();
    expect(models[0]).toMatchObject({ inputPricePerMillion: 1, outputPricePerMillion: 2 });
    expect(new Headers(transport.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
  });
  it('vẫn hủy ngay khi SSE đã DONE nhưng HTTP chưa kết thúc', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: '{"translation":"Chào.","speaker":"unknown","listener":"unknown"}' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
            ),
          );
        },
        cancel,
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
    const controller = new AbortController();
    const progress = vi.fn();
    const task = new OpenRouter(
      () => 'key',
      async () => response,
    ).translate('model', [], controller.signal, progress);
    const result = expect(task).rejects.toThrow('CANCELLED');
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith('Chào.'));
    controller.abort();
    await result;
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('giải phóng body HTTP lỗi trước khi trả lỗi xác thực', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { status: 401 });
    const api = new OpenRouter(
      () => 'key',
      async () => response,
    );
    await expect(api.models()).rejects.toThrow('API_KEY');
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('không coi response chỉ có suy luận mà thiếu tóm tắt là thành công', async () => {
    const api = new OpenRouter(
      () => 'key',
      async () => new Response('{"choices":[{"message":{"content":"","reasoning":"hidden"}}]}'),
    );
    await expect(api.summarize('model', 'Data', new AbortController().signal)).rejects.toThrow(
      'RESPONSE',
    );
  });
  it.each(['openrouter/free', 'vendor/concrete-model'])(
    'dịch tắt suy luận, tóm tắt luôn bật cho %s; bật cache và giữ affinity theo mục đích',
    async (model) => {
      const transport = vi.fn<typeof fetch>().mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: '{"translation":"Chào.","speaker":"unknown","listener":"unknown"}',
                  },
                },
              ],
            }),
          ),
      );
      const api = new OpenRouter(() => 'key', transport);
      await api.translate(model, [], new AbortController().signal, undefined, 'session-one');
      await api.translate(model, [], new AbortController().signal, undefined, 'session-one');
      await api.summarize(model, 'Data', new AbortController().signal, 'session-one');
      const bodies = transport.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
      expect(bodies[0].reasoning).toEqual({ enabled: false, exclude: true });
      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[2].reasoning).toEqual({ enabled: true, exclude: true });
      expect(bodies[2].max_tokens).toBeGreaterThan(bodies[0].max_tokens);
      expect(bodies[0].session_id).toBe('session-one:translation');
      expect(bodies[2].session_id).toBe('session-one:summary');
      for (const [, init] of transport.mock.calls) {
        const headers = new Headers(init?.headers);
        expect(headers.get('X-OpenRouter-Cache')).toBe('true');
        expect(headers.get('X-OpenRouter-Cache-TTL')).toBe('300');
      }
    },
  );
  it('không bật response cache cho danh sách model và không dùng lại affinity của phiên khác', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).endsWith('/models')
          ? new Response('{"data":[]}')
          : new Response(
              '{"choices":[{"message":{"content":"{\\"translation\\":\\"Chào.\\",\\"speaker\\":\\"unknown\\",\\"listener\\":\\"unknown\\"}"}}]}',
            ),
      );
    const api = new OpenRouter(() => 'key', transport);
    await api.models();
    expect(new Headers(transport.mock.calls[0][1]?.headers).has('X-OpenRouter-Cache')).toBe(false);
    await api.translate('model', [], new AbortController().signal, undefined, 'first');
    await api.translate('model', [], new AbortController().signal, undefined, 'second');
    expect(JSON.parse(String(transport.mock.calls[1][1]?.body)).session_id).not.toBe(
      JSON.parse(String(transport.mock.calls[2][1]?.body)).session_id,
    );
  });
  it.each([undefined, 123, ''])(
    'không gán router cấu hình thành model thực tế khi metadata thiếu/sai: %j',
    async (model) => {
      const api = new OpenRouter(
        () => 'key',
        async () =>
          new Response(
            JSON.stringify({
              model,
              choices: [
                {
                  message: {
                    content:
                      '{"translation":"Chào.","speaker":"unknown","listener":"unknown","modelId":"fake/model"}',
                  },
                },
              ],
            }),
          ),
      );
      const result = await api.translate('openrouter/free', [], new AbortController().signal);
      expect(result.translation).toBe('Chào.');
      expect(result.modelId).toBeUndefined();
    },
  );
  it.each(['json', 'stream'])(
    'lấy model thực tế từ metadata %s thay vì router yêu cầu hoặc JSON AI',
    async (mode) => {
      const content =
        '{"translation":"Chào.","speaker":"unknown","listener":"unknown","modelId":"fake/model"}';
      const model = 'vendor/actual-model:free';
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          mode === 'json'
            ? new Response(JSON.stringify({ model, choices: [{ message: { content } }] }))
            : new Response(
                `data: ${JSON.stringify({ model, choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 2 } })}\n\ndata: [DONE]\n\n`,
                { headers: { 'content-type': 'text/event-stream' } },
              ),
        );
      const result = await new OpenRouter(() => 'key', transport).translate(
        'openrouter/free',
        [],
        new AbortController().signal,
      );
      expect(result.modelId).toBe(model);
      expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).provider).toEqual({
        require_parameters: true,
        sort: 'latency',
      });
    },
  );
  it('tóm tắt cũng ưu tiên provider theo latency', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"choices":[{"message":{"content":"Tóm tắt."}}]}'));
    expect(
      await new OpenRouter(() => 'key', transport).summarize(
        'selected-model',
        'Data',
        new AbortController().signal,
      ),
    ).toBe('Tóm tắt.');
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).provider.sort).toBe('latency');
  });
  it('vẫn nhận chi phí khi API không có số token', async () => {
    const response = new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '{"translation":"Chào.","speaker":"unknown","listener":"unknown"}',
            },
          },
        ],
        usage: { cost: 0 },
      }),
    );
    const result = await new OpenRouter(
      () => 'key',
      async () => response,
    ).translate('model', [], new AbortController().signal);
    expect(result.costUsd).toBe(0);
    expect(result.usage).toBeUndefined();
  });
  it.each(['json', 'stream'])('đọc chi phí từ metadata %s, không từ nội dung AI', async (mode) => {
    const content =
      '{"translation":"Chào.","speaker":"unknown","listener":"unknown","costUsd":999}';
    const usage = {
      prompt_tokens: 420,
      completion_tokens: 36,
      cost: 0.00001234,
      cost_details: { upstream_inference_cost: 99 },
    };
    const response =
      mode === 'json'
        ? new Response(JSON.stringify({ choices: [{ message: { content } }], usage }))
        : new Response(
            `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`,
            { headers: { 'content-type': 'text/event-stream' } },
          );
    const result = await new OpenRouter(
      () => 'key',
      async () => response,
    ).translate('model', [], new AbortController().signal);
    expect(result.costUsd).toBe(0.00001234);
    expect(result.usage).toEqual({ inputTokens: 420, outputTokens: 36 });
  });
  it.each([0, undefined, null, -1, '0.12'])(
    'phân biệt chi phí 0 và giá trị thiếu/sai: %j',
    async (cost) => {
      const response = new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"translation":"Chào.","speaker":"unknown","listener":"unknown"}',
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 2, cost },
        }),
      );
      const result = await new OpenRouter(
        () => 'key',
        async () => response,
      ).translate('model', [], new AbortController().signal);
      expect(result.costUsd).toBe(cost === 0 ? 0 : undefined);
      expect(result.usage).toEqual({ inputTokens: 1, outputTokens: 2 });
    },
  );
  it.each(['json', 'stream'])(
    'đọc token thật từ usage của response %s, không từ JSON do AI viết',
    async (mode) => {
      const content = JSON.stringify({
        translation: 'Chào.',
        speaker: 'unknown',
        listener: 'unknown',
        usage: { inputTokens: 9999, outputTokens: 9999 },
      });
      const usage = { prompt_tokens: 420, completion_tokens: 36, total_tokens: 456 };
      const response =
        mode === 'json'
          ? new Response(JSON.stringify({ choices: [{ message: { content } }], usage }))
          : new Response(
              `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`,
              { headers: { 'content-type': 'text/event-stream' } },
            );
      const api = new OpenRouter(
        () => 'key',
        async () => response,
      );
      const result = await api.translate('model', [], new AbortController().signal);
      expect(result).toMatchObject({
        translation: 'Chào.',
        usage: { inputTokens: 420, outputTokens: 36 },
      });
    },
  );
  it.each([
    undefined,
    { prompt_tokens: -1, completion_tokens: 2 },
    { prompt_tokens: '12', completion_tokens: 2 },
  ])('không bịa số token khi usage thiếu hoặc sai cấu trúc: %j', async (usage) => {
    const api = new OpenRouter(
      () => 'key',
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"translation":"Chào.","speaker":"unknown","listener":"unknown"}',
                },
              },
            ],
            usage,
          }),
        ),
    );
    const result = await api.translate('model', [], new AbortController().signal);
    expect(result.translation).toBe('Chào.');
    expect(result.usage).toBeUndefined();
  });
  it('hiện chữ streaming trước khi request kết thúc, giữ Unicode và bỏ qua heartbeat', async () => {
    const encoder = new TextEncoder();
    let feed: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        feed = controller;
      },
    });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(stream, {
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    const progress = vi.fn();
    const task = new OpenRouter(() => 'key', transport).translate(
      'openrouter/free',
      [],
      new AbortController().signal,
      progress,
    );
    const outcome = task.catch(() => undefined);
    let finished = false;
    void outcome.then(() => {
      finished = true;
    });
    try {
      const first = encoder.encode(
        ': OPENROUTER PROCESSING\r\n\r\ndata: ' +
          JSON.stringify({ choices: [{ delta: { content: '{"translation":"Chào' } }] }) +
          '\r\n\r\n',
      );
      for (const byte of first) feed?.enqueue(new Uint8Array([byte]));
      await vi.waitFor(() => expect(progress).toHaveBeenCalledWith('Chào'));
      expect(finished).toBe(false);
      const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
      expect(body.stream).toBe(true);
      expect(body.provider.sort).toBe('latency');
      expect(body.reasoning).toEqual({ enabled: false, exclude: true });
      feed?.enqueue(
        encoder.encode(
          'data: ' +
            JSON.stringify({
              choices: [
                {
                  delta: { content: ' con.","speaker":"Father","listener":"Son"}' },
                  finish_reason: 'stop',
                },
              ],
            }) +
            '\n\ndata: [DONE]\n\n',
        ),
      );
      feed?.close();
      await expect(task).resolves.toEqual({
        translation: 'Chào con.',
        speaker: 'Father',
        listener: 'Son',
      });
    } finally {
      if (!finished) {
        try {
          feed?.close();
        } catch {
          /* Reader có thể đã hủy body. */
        }
      }
      await outcome;
    }
  });
  it.each(['error', 'truncated', 'length'])(
    'không chấp nhận bản nháp khi stream %s',
    async (kind) => {
      const partial = { choices: [{ delta: { content: '{"translation":"Chào' } }] };
      const tail =
        kind === 'error'
          ? { error: { code: 'server_error' } }
          : kind === 'length'
            ? { choices: [{ finish_reason: 'length' }] }
            : null;
      const data =
        `data: ${JSON.stringify(partial)}\n\n` + (tail ? `data: ${JSON.stringify(tail)}\n\n` : '');
      const api = new OpenRouter(
        () => 'key',
        async () => new Response(data, { headers: { 'content-type': 'text/event-stream' } }),
      );
      await expect(api.translate('model', [], new AbortController().signal)).rejects.toThrow();
    },
  );
  it('hủy stream đang chờ body ngay khi dừng phiên, không chờ timeout API', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { 'content-type': 'text/event-stream' },
    });
    const controller = new AbortController();
    const api = new OpenRouter(
      () => 'key',
      async () => response,
    );
    const task = api.translate('model', [], controller.signal);
    const assertion = expect(task).rejects.toThrow('CANCELLED');
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    await assertion;
    expect(cancel).toHaveBeenCalled();
  });
  it('chọn định dạng theo khả năng của từng model và cập nhật sau khi tải lại', async () => {
    const transport = vi.fn<typeof fetch>();
    transport.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'strict',
              name: 'Strict',
              context_length: 8000,
              supported_parameters: ['structured_outputs'],
            },
            { id: 'plain', name: 'Plain', context_length: 8000 },
          ],
        }),
      ),
    );
    const api = new OpenRouter(() => 'key', transport);
    const models = await api.models();
    expect(models.map((model) => [model.id, model.supportsStructuredOutputs])).toEqual([
      ['strict', true],
      ['plain', false],
    ]);
    const content = JSON.stringify({
      translation: 'Chào',
      speaker: 'unknown',
      listener: 'unknown',
    });
    transport.mockImplementation(
      async () => new Response(JSON.stringify({ choices: [{ message: { content } }] })),
    );
    await api.translate('strict', [], new AbortController().signal);
    await api.translate('plain', [], new AbortController().signal);
    const strict = JSON.parse(String(transport.mock.calls[1][1]?.body));
    const plain = JSON.parse(String(transport.mock.calls[2][1]?.body));
    expect(strict.response_format.type).toBe('json_schema');
    expect(plain.response_format).toBeUndefined();
    expect(JSON.stringify(plain.messages)).toContain('translation');
    expect(JSON.stringify(plain.messages)).toContain('listener');
  });
  it('dùng prompt JSON cho model hồ sơ và từ chối kết quả không hợp lệ', async () => {
    let content = JSON.stringify({
      characters: [],
      relationships: [],
      glossary: [],
      evidence: 'Chưa rõ',
    });
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify({ choices: [{ message: { content } }] })),
      );
    const api = new OpenRouter(() => 'key', transport);
    api.setModels([
      { id: 'plain', supportsStructuredOutputs: false },
      { id: 'strict', supportsStructuredOutputs: true },
    ]);
    await api.enrichProfile('plain', '{}', new AbortController().signal);
    await api.enrichProfile('strict', '{}', new AbortController().signal);
    const plain = JSON.parse(String(transport.mock.calls[0][1]?.body));
    const strict = JSON.parse(String(transport.mock.calls[1][1]?.body));
    expect(plain.response_format).toBeUndefined();
    expect(plain.messages[0].content).toContain('evidence');
    expect(strict.response_format.type).toBe('json_schema');
    content = '{"characters":[]}';
    await expect(api.enrichProfile('plain', '{}', new AbortController().signal)).rejects.toThrow(
      'RESPONSE',
    );
    content = 'không phải JSON';
    await expect(api.translate('plain', [], new AbortController().signal)).rejects.toThrow(
      'RESPONSE',
    );
  });
  it('cập nhật khả năng model khi tải lại và phát bản nháp từ JSON không ép schema', async () => {
    let supports = false;
    const transport = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith('/models'))
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'model',
                name: 'Model',
                context_length: 8000,
                supported_parameters: supports ? ['structured_outputs'] : [],
              },
            ],
          }),
        );
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: '{"translation":"Chào","speaker":"unknown","listener":"unknown"}' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      );
    });
    const api = new OpenRouter(() => 'key', transport);
    await api.models();
    const progress = vi.fn();
    await api.translate('model', [], new AbortController().signal, progress);
    expect(progress).toHaveBeenCalledWith('Chào');
    expect(JSON.parse(String(transport.mock.calls[1][1]?.body)).response_format).toBeUndefined();
    supports = true;
    await api.models();
    await api.translate('model', [], new AbortController().signal);
    expect(JSON.parse(String(transport.mock.calls[3][1]?.body)).response_format.type).toBe(
      'json_schema',
    );
  });
  it('ghi từng lần HTTP 429 và nội dung lỗi nhưng không để lộ key', async () => {
    const logs = new DebugLog(() => undefined);
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response('{"error":"quota secret-key"}', {
          status: 429,
          headers: { 'retry-after': '0' },
        }),
    );
    const api = new OpenRouter(() => 'secret-key', transport, transport, logs);
    await expect(api.translate('model', [], new AbortController().signal)).rejects.toThrow(
      'RATE_LIMIT',
    );
    expect(logs.snapshot()).toHaveLength(2);
    expect(
      logs
        .snapshot()
        .every(
          (entry) =>
            entry.status === 'error' &&
            entry.httpStatus === 429 &&
            entry.response.includes('quota'),
        ),
    ).toBe(true);
    expect(JSON.stringify(logs.snapshot())).not.toContain('secret-key');
  });
  it('ghi lỗi validation của response thành công HTTP', async () => {
    const logs = new DebugLog(() => undefined);
    const api = new OpenRouter(
      () => 'key',
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'invalid json' } }] })),
      undefined,
      logs,
    );
    await expect(api.translate('model', [], new AbortController().signal)).rejects.toThrow(
      'RESPONSE',
    );
    expect(logs.snapshot()[0]).toMatchObject({
      status: 'error',
      httpStatus: 200,
      error: 'RESPONSE',
    });
    expect(logs.snapshot()[0].response).toContain('invalid json');
  });
  it('xác định model miễn phí theo giá token và request, không dựa vào tên model', async () => {
    const entries = [
      { id: 'paid:free', pricing: { prompt: '0', completion: '0.01' } },
      { id: 'zero', pricing: { prompt: '0.0', completion: '0', request: '0' } },
      { id: 'unknown' },
      { id: 'request-fee', pricing: { prompt: '0', completion: '0', request: '0.01' } },
    ];
    const api = new OpenRouter(
      () => 'key',
      async () =>
        new Response(
          JSON.stringify({
            data: entries.map((entry) => ({
              ...entry,
              name: entry.id,
              context_length: 8000,
              supported_parameters: ['structured_outputs'],
            })),
          }),
        ),
    );
    expect((await api.models()).map((model) => ({ id: model.id, isFree: model.isFree }))).toEqual([
      { id: 'paid:free', isFree: false },
      { id: 'zero', isFree: true },
      { id: 'unknown', isFree: false },
      { id: 'request-fee', isFree: false },
    ]);
  });
  it('chỉ retry một lần với 429 và tôn trọng Retry-After', async () => {
    vi.useFakeTimers();
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    translation: 'Đi thôi.',
                    speaker: 'unknown',
                    listener: 'unknown',
                  }),
                },
              },
            ],
          }),
        ),
      );
    const task = new OpenRouter(() => 'key', transport).translate(
      'model',
      [],
      new AbortController().signal,
    );
    try {
      await vi.advanceTimersByTimeAsync(999);
      expect(transport).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await task).translation).toBe('Đi thôi.');
      expect(transport).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('kiểm tra JSON và không gửi key trong body', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
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
      ),
    );
    const api = new OpenRouter(() => 'secret', transport);
    const result = await api.translate(
      'model',
      [{ role: 'user', content: 'Hello' }],
      new AbortController().signal,
    );
    expect(result.translation).toBe('Chào con.');
    expect(String(transport.mock.calls[0][1]?.body)).not.toContain('secret');
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).reasoning).toEqual({
      enabled: false,
      exclude: true,
    });
  });
  it('không retry lỗi xác thực', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 }));
    const api = new OpenRouter(() => 'bad', transport);
    await expect(api.translate('model', [], new AbortController().signal)).rejects.toThrow(
      'API_KEY',
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('báo response lỗi thay vì hiển thị JSON thô', async () => {
    const api = new OpenRouter(
      () => 'key',
      async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] })),
    );
    await expect(api.translate('model', [], new AbortController().signal)).rejects.toThrow(
      'RESPONSE',
    );
  });
  it('timeout hủy transport và trả mã rõ ràng', async () => {
    vi.useFakeTimers();
    const api = new OpenRouter(
      () => 'key',
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const assertion = expect(
      api.translate('model', [], new AbortController().signal),
    ).rejects.toThrow('TIMEOUT');
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });
});
