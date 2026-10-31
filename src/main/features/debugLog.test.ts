import { describe, expect, it } from 'vitest';
import { DebugLog } from './debugLog';

describe('Nhật ký debug trong bộ nhớ', () => {
  it('ghi request, response và lỗi nhưng ẩn API key, xóa được toàn bộ', () => {
    const log = new DebugLog(() => undefined);
    const id = log.start('/chat/completions', { messages: ['hello', 'secret-key'] }, 'secret-key');
    log.finish(id, 429, '{"error":"secret-key quota"}', 'RATE_LIMIT');
    const entries = log.snapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ status: 'error', httpStatus: 429, error: 'RATE_LIMIT' });
    expect(JSON.stringify(entries)).not.toContain('secret-key');
    expect(entries[0].response).toContain('quota');
    log.clear();
    expect(log.snapshot()).toEqual([]);
  });
  it('giới hạn số bản ghi và cắt nội dung dài', () => {
    const log = new DebugLog(() => undefined);
    for (let i = 0; i < 101; i++) log.start('/models', { value: 'x'.repeat(110000) }, 'key');
    expect(log.snapshot()).toHaveLength(100);
    expect(log.snapshot()[0].request).toContain('[truncated]');
  });
});
