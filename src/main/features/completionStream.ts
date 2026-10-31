import { z } from 'zod';
import type { TokenUsage } from '../../shared/types';
import { modelIdSchema } from '../../shared/types';

const MAX_CONTENT_LENGTH = 128000;
const chunkSchema = z.object({
  model: modelIdSchema.optional().catch(undefined),
  error: z.unknown().optional(),
  usage: z.unknown().optional(),
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullish() }).optional(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
});

const apiUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
});
const apiCostSchema = z.object({ cost: z.number().nonnegative() });

/** Nội dung và metadata của completion; không trộn usage vào schema model phải sinh. */
export interface CompletionResult {
  content: string;
  modelId?: string;
  usage?: TokenUsage;
  /** Chi phí tài khoản của request, không phải upstream_inference_cost. */
  costUsd?: number;
}

/** Đọc độc lập usage.cost; không đoán giá tiền từ token hoặc giá model. */
export function readCostUsd(value: unknown): number | undefined {
  const parsed = apiCostSchema.safeParse(value);
  return parsed.success ? parsed.data.cost : undefined;
}

/** Chỉ chấp nhận token nguyên không âm từ metadata API; thiếu/sai giữ trạng thái chưa biết. */
export function readTokenUsage(value: unknown): TokenUsage | undefined {
  const parsed = apiUsageSchema.safeParse(value);
  return parsed.success
    ? { inputTokens: parsed.data.prompt_tokens, outputTokens: parsed.data.completion_tokens }
    : undefined;
}

/**
 * Chỉ lấy giá trị chuỗi translation ở cấp đầu của JSON để hiển thị bản nháp.
 * Không đưa JSON thô lên UI, không đoán phần escape/Unicode còn thiếu ở cuối chunk.
 * Schema đầy đủ vẫn phải được kiểm tra khi request kết thúc.
 */
export function translationPreview(content: string): string {
  let index = 0;
  /** Bỏ khoảng trắng giữa các token, không thay đổi nội dung chuỗi JSON. */
  function whitespace(): void {
    while (/\s/.test(content[index] ?? '') && index < content.length) index++;
  }
  /** Đọc chuỗi có thể chưa hoàn tất; chỉ trả các escape đã nhận đủ. */
  function string(): { text: string; complete: boolean } | null {
    if (content[index] !== '"') return null;
    const start = ++index;
    while (index < content.length) {
      const char = content[index];
      if (char === '"') break;
      if (char === '\\') {
        if (index + 1 >= content.length) break;
        if (content[index + 1] === 'u') {
          if (!/^[\da-f]{4}$/i.test(content.slice(index + 2, index + 6))) break;
          index += 6;
        } else index += 2;
      } else index++;
    }
    const complete = content[index] === '"';
    try {
      const text = String(JSON.parse(`"${content.slice(start, index)}"`)).replace(
        /[\uD800-\uDBFF]$/,
        '',
      );
      if (complete) index++;
      return { text, complete };
    } catch {
      return null;
    }
  }
  whitespace();
  if (content[index++] !== '{') return '';
  while (index < content.length) {
    whitespace();
    const key = string();
    if (!key?.complete) return '';
    whitespace();
    if (content[index++] !== ':') return '';
    whitespace();
    const value = string();
    if (!value) return '';
    if (key.text === 'translation') return value.text;
    if (!value.complete || !['speaker', 'listener'].includes(key.text)) return '';
    whitespace();
    if (content[index++] !== ',') return '';
  }
  return '';
}

/**
 * Đọc SSE theo event, hỗ trợ UTF-8/chunk chia nhỏ, CRLF và heartbeat.
 * Sau DONE vẫn đọc tới HTTP EOF để trả socket về pool, không hủy body hoàn tất.
 * Hủy luôn reader khi đổi phiên/timeout. Stream lỗi hoặc kết thúc dở không được coi là thành công.
 */
export async function readCompletionStream(
  response: Response,
  signal: AbortSignal,
  progress?: (content: string) => void,
  onEvent?: (event: string) => void,
): Promise<CompletionResult> {
  if (!response.body) throw new Error('RESPONSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let data: string[] = [];
  let content = '';
  let done = false;
  let finished = false;
  let ended = false;
  let usage: TokenUsage | undefined;
  let costUsd: number | undefined;
  let modelId: string | undefined;
  /** Abort giải phóng read đang chờ, kể cả với transport không tự nối signal vào body. */
  function abort(): void {
    void reader.cancel().catch(() => undefined);
  }
  /** Giải mã một SSE event; không đọc reasoning hoặc coi usage chunk là nội dung. */
  function event(): void {
    const payload = data.join('\n');
    data = [];
    if (!payload) return;
    onEvent?.(payload);
    if (payload.trim() === '[DONE]') {
      done = true;
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(payload);
    } catch {
      throw new Error('RESPONSE');
    }
    const parsed = chunkSchema.safeParse(raw);
    if (!parsed.success) throw new Error('RESPONSE');
    if (parsed.data.error) throw new Error('NETWORK');
    modelId = parsed.data.model ?? modelId;
    usage = readTokenUsage(parsed.data.usage) ?? usage;
    costUsd = readCostUsd(parsed.data.usage) ?? costUsd;
    const choice = parsed.data.choices?.[0];
    if (choice?.finish_reason === 'error') throw new Error('NETWORK');
    if (choice?.finish_reason === 'length') throw new Error('RESPONSE');
    if (choice?.finish_reason === 'stop') finished = true;
    if (choice?.delta?.content) {
      content += choice.delta.content;
      if (content.length > MAX_CONTENT_LENGTH) throw new Error('RESPONSE');
      progress?.(content);
    }
  }
  /** Ghép data nhiều dòng theo SSE; bỏ comment và các field không dùng. */
  function line(value: string): void {
    if (!value) event();
    else if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''));
  }
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) throw new Error('CANCELLED');
    while (true) {
      const next = await reader.read();
      if (signal.aborted) throw new Error('CANCELLED');
      ended = next.done;
      // DONE kết thúc SSE, nhưng vẫn đọc hết HTTP để socket được trả lại pool Keep-Alive.
      if (done) {
        if (next.done) break;
        continue;
      }
      buffer += decoder.decode(next.value, { stream: !next.done });
      if (buffer.length > MAX_CONTENT_LENGTH) throw new Error('RESPONSE');
      let end: number;
      while (!done && (end = buffer.indexOf('\n')) >= 0) {
        line(buffer.slice(0, end).replace(/\r$/, ''));
        buffer = buffer.slice(end + 1);
      }
      if (next.done) {
        if (buffer) line(buffer.replace(/\r$/, ''));
        if (data.length) event();
        break;
      }
    }
    if (!done && !finished) throw new Error('NETWORK');
    return {
      content,
      ...(modelId ? { modelId } : {}),
      ...(usage ? { usage } : {}),
      ...(costUsd !== undefined ? { costUsd } : {}),
    };
  } finally {
    signal.removeEventListener('abort', abort);
    if (!ended) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
